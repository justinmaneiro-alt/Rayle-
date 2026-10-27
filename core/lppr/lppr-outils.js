import { norm, sansPonctuation, NOMS_FAMILLES, extraireRegles, phrases } from './lppr-regles.js';

/* ═════════════ LPPR : LES OUTILS DE RAYLÉ (module pur, testé : galaxie/tests/lppr-graphe-test.mjs) ═════════════
   chercher_code_lppr · expliquer_code · verifier_cumul · forfait_reparation  (proposer_devis et verifier_devis sont dans lppr-devis.js).
   Données : data/lppr/graphe.json (construit depuis le PDF officiel de l'Assurance Maladie par core/lppr/construire-graphe.mjs) et data/lppr/vocabulaire.json (les mots du métier).
   GARDE-FOUS : Raylé cite TOUJOURS le chapitre, la section et la page ; ne fabrique JAMAIS un code ni un tarif ; dit « je ne trouve pas » quand c'est le cas ; affiche la version et la date de la LPPR
   utilisée ; rappelle « à vérifier avec la nomenclature en vigueur ». Un code dont la prise en charge est terminée est signalé « plus remboursable ». */
export const A_VERIFIER = 'À vérifier avec la nomenclature en vigueur (ameli.fr, Légifrance) : cet outil ne remplace pas la LPPR officielle.';
const MOTS_VIDES = new Set(('le la les un une des du de d l au aux et ou en pour avec sans sur sous par dans a est il elle je tu nous vous on que qui quoi ce cet cette ces mon ma mes son sa ses se ne pas plus ai as ont faut falloir code codes lppr lpp ' +
  'cherche chercher trouve trouver donne donner moi dis quel quels quelle quelles devis patient besoin voudrais veux rayle raylé comment combien quoi propose proposer fais faire sont pose poser').split(' '));
const lisse = t => { let x = t.length > 3 && /[sx]$/.test(t) ? t.slice(0, -1) : t; if (x.length > 4 && x.endsWith('e')) x = x.slice(0, -1); return x; };   // racine légère : « jambière / jambier », « tibiale / tibial », « emboîtures / emboîtur »
const MOTS_SOUPLES = new Set(['adult', 'enfant', 'mesur']);   // âge et « sur mesure » aident au classement mais ne sont pas exigés
export const jetons = texte => sansPonctuation(texte).split(' ').filter(t => t.length >= 2 && !MOTS_VIDES.has(t)).map(lisse);
const fr2 = v => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') + ' €' : null);
export const formatEuro = v => fr2(v) || 'non lu dans la nomenclature';

export function creerLppr(graphe, { vocabulaire = null, corrections = null, aujourdhui = null } = {}) {
  if (!graphe || !Array.isArray(graphe.codes)) return { ok: false, raison: 'La nomenclature LPPR (data/lppr/graphe.json) est absente : voir docs/LPPR.md.' };
  const meta = graphe.meta || {}, date = aujourdhui || new Date().toISOString().slice(0, 10), corr = corrections || { ajouts: {}, exclusions: {}, synonymes: {} };
  const codes = graphe.codes, parCode = new Map(codes.map(c => [c.code, c])), parRef = new Map(), sections = new Map((graphe.sections || []).map(s => [s.id, s]));
  for (const c of codes) if (c.reference) { const k = norm(c.reference).replace(/[^a-z0-9]/g, ''); const l = parRef.get(k) || []; l.push(c); parRef.set(k, l); }
  /* index de mots : mot → Map(code → poids) */
  const inv = new Map(); let N = 0;
  const poser = (code, mots, poids) => { for (const t of mots) { let m = inv.get(t); if (!m) inv.set(t, m = new Map()); m.set(code, Math.max(m.get(code) || 0, poids)); } };
  for (const c of codes) {
    N++; const sec = sections.get(c.section);
    poser(c.code, jetons(c.designation), 3); poser(c.code, jetons(c.reference), 3); poser(c.code, jetons(c.description), 1.4); poser(c.code, jetons(c.rubrique), 1.2); poser(c.code, jetons(sec ? sec.titre : ''), 0.8); poser(c.code, jetons((c.chemin_complet || (sec && sec.chemin) || []).slice(1).join(' ')), 0.9);
    poser(c.code, jetons(c.familles.map(f => NOMS_FAMILLES[f] || f).join(' ')), 1);
  }
  const desig = new Map(codes.map(c => [c.code, jetons((c.designation || '') + ' ' + (c.reference || ''))]));   // jetons de la désignation, dans l'ordre (bonus des expressions : « avant bras », « pied restitution »)
  const idf = t => { const m = inv.get(t); return m ? Math.log(1 + N / m.size) : 0; };
  const termes = vocabulaire && vocabulaire.termes ? vocabulaire.termes.map(t => ({ ...t, _mots: t.mots.map(sansPonctuation) })) : [];
  const phraseContient = (q, p) => (' ' + q + ' ').includes(' ' + p + ' ');

  function reconnaitre(requete) {
    const q = sansPonctuation(requete), vus = [];
    for (const t of termes) { const m = t._mots.find(p => p && phraseContient(q, p)); if (m) vus.push({ id: t.id, mot: m, officiel: t.officiel, familles: t.familles || [], incertain: !!t.incertain, note: t.note || null }); }
    // le terme le plus long gagne (« corset scoliose » avant « corset ») : on retire ceux dont le mot est contenu dans un mot plus long reconnu
    return vus.filter(a => !vus.some(b => b !== a && b.mot.length > a.mot.length && phraseContient(b.mot, a.mot)));
  }
  const phraseRef = c => {
    const sec = sections.get(c.section), chap = c.chapitre ? 'chapitre ' + c.chapitre + ' (' + ((meta.chapitres || {})[c.chapitre] || '') + ')' : 'chapitre inconnu';
    return 'Titre II, ' + chap + (c.rubrique ? ', ' + c.rubrique : sec && sec.titre ? ', ' + sec.titre : '') + ', page ' + c.page_pdf + ' du PDF de la LPP (' + (meta.version || 'version inconnue') + ')';
  };
  const resume = (c, extra = {}) => ({ code: c.code, reference: c.reference, designation: c.designation, rubrique: c.rubrique, type: c.type, familles: c.familles, tarif: c.tarif, plv: c.plv, prix_cession_ht: c.prix_cession_ht, tarif_texte: c.tarif_texte, fin_prise_en_charge: c.fin_prise_en_charge,
    actif: c.actif !== false && (!c.fin_prise_en_charge || c.fin_prise_en_charge >= date), page_pdf: c.page_pdf, chapitre: c.chapitre, reference_texte: phraseRef(c), ...extra });
  const actif = c => !c.fin_prise_en_charge || c.fin_prise_en_charge >= date;

  /* ── 1. chercher_code_lppr ── */
  function chercher(requete, { limite = 8, inclureInactifs = false, familles = null, types = null, membre = null } = {}) {
    const brut = String(requete || '').trim(); if (!brut) return { ok: false, raison: 'Dis-moi un code ou quelques mots (par exemple « emboîture tibiale »).', resultats: [] };
    const base = { version: meta.version, date_version: meta.date_version, rappel: A_VERIFIER };
    const m7 = brut.match(/\b\d{7}\b/);
    if (m7) { const c = parCode.get(m7[0]); return c ? { ok: true, ...base, requete: brut, resultats: [resume(c, { score: 100, pourquoi: ['code exact'] })], termes_reconnus: [], aucun: false } : { ok: true, ...base, requete: brut, resultats: [], aucun: true, message: 'Je ne trouve pas le code ' + m7[0] + ' dans le Titre II de la LPP (' + (meta.version || '') + '). Je n’invente jamais un code.' }; }
    const cleRef = norm(brut).replace(/[^a-z0-9]/g, '');
    if (/^[a-z]{1,3}\d[a-z0-9]{2,10}$/.test(cleRef) && parRef.has(cleRef)) return { ok: true, ...base, requete: brut, resultats: parRef.get(cleRef).map(c => resume(c, { score: 100, pourquoi: ['référence exacte'] })), termes_reconnus: [], aucun: false };
    const reco = reconnaitre(brut), q = jetons(brut), core = new Set(q), expansion = new Set(), famBonus = new Set();
    for (const r of reco) { for (const o of r.officiel || []) for (const t of jetons(o)) if (!core.has(t)) expansion.add(t); for (const f of r.familles) famBonus.add(f); for (const s of (corr.synonymes && corr.synonymes[r.id]) || []) for (const t of jetons(s)) expansion.add(t); }
    if (!core.size && !expansion.size) return { ok: true, ...base, requete: brut, resultats: [], aucun: true, message: 'Je n’ai pas assez de mots pour chercher. Donne-moi l’appareil (par exemple « prothèse tibiale », « corset », « releveur »).', termes_reconnus: reco };
    const scores = new Map(), pourquoi = new Map(), coeur = new Map();
    const crediter = (t, poidsRequete, role) => { const m = inv.get(t); if (!m) return; const w = idf(t); for (const [code, pd] of m) { scores.set(code, (scores.get(code) || 0) + w * pd * poidsRequete); const p = pourquoi.get(code) || new Set(); p.add(t); pourquoi.set(code, p); if (role === 'coeur') coeur.set(code, (coeur.get(code) || 0) + 1); } };
    for (const t of core) crediter(t, 1, 'coeur'); for (const t of expansion) crediter(t, 0.55, 'exp');
    const qOrdre = jetons(brut); for (let i = 0; i + 1 < qOrdre.length; i++) { const a = qOrdre[i], b = qOrdre[i + 1], ma = inv.get(a), mb = inv.get(b); if (!ma || !mb) continue; const w = (idf(a) + idf(b)) * 1.6; for (const code of ma.keys()) { if (!mb.has(code)) continue; const d = desig.get(code); for (let k = 0; k + 1 < d.length; k++) if (d[k] === a && d[k + 1] === b) { scores.set(code, (scores.get(code) || 0) + w); break; } } }
    const exclus = new Set(); for (const r of reco) for (const c of (corr.exclusions && corr.exclusions[r.id]) || []) exclus.add(c);
    let liste = []; const inactifsListe = [], indexes = [...core].filter(t => inv.has(t) && !MOTS_SOUPLES.has(t));
    for (const [code, s] of scores) {
      const c = parCode.get(code); if (exclus.has(code)) continue;
      // un résultat doit couvrir la plupart des mots de la demande qui existent dans la nomenclature (sinon « attelle de main » ramènerait toutes les attelles de genou) ;
      // si aucun mot de la demande n'existe dans la nomenclature, seule la famille reconnue par le vocabulaire peut qualifier une ligne
      const nCoeur = coeur.get(code) || 0, besoin = indexes.length ? Math.ceil(indexes.length * 0.6) : 0;
      if (indexes.length ? nCoeur < besoin : !(famBonus.size && [...famBonus].some(f => c.familles.includes(f)))) continue;
      if (!inclureInactifs && !actif(c)) { inactifsListe.push([c, s]); continue; }
      if (familles && !familles.some(f => c.familles.includes(f))) continue; if (types && !types.includes(c.type)) continue; if (membre && c.membre !== membre) continue;
      let sc = s; if (famBonus.size) { if ([...famBonus].some(f => c.familles.includes(f))) sc = sc * 2 + 8; else sc *= 0.2; }   // la famille reconnue (corset, prothèse fémorale…) l'emporte sur un simple mot partagé
      if ((coeur.get(code) || 0) >= Math.min(core.size, 2) && core.size) sc *= 1.25;
      if (core.size > 1 && (coeur.get(code) || 0) < Math.ceil(core.size / 2)) sc *= 0.6;
      if (!actif(c)) sc *= 0.4;
      liste.push([c, sc]);
    }
    for (const r of reco) for (const code of (corr.ajouts && corr.ajouts[r.id]) || []) { const c = parCode.get(code); if (c && !liste.some(x => x[0] === c)) liste.push([c, 1000]); else if (c) liste.find(x => x[0] === c)[1] += 1000; }
    // la famille reconnue par le vocabulaire (corset, minerve, siège…) est un FILTRE : si aucune ligne de cette famille ne répond, on le dit au lieu de proposer autre chose
    if (famBonus.size) { const membre2 = c => [...famBonus].some(f => c.familles.includes(f)); liste = liste.filter(x => membre2(x[0]) || x[1] >= 1000); for (let k = inactifsListe.length - 1; k >= 0; k--) if (!membre2(inactifsListe[k][0])) inactifsListe.splice(k, 1); }
    liste.sort((a, b) => b[1] - a[1]);
    const top = liste.length ? liste[0][1] : 0; liste = liste.filter(x => x[1] >= top * 0.35).slice(0, limite);
    inactifsListe.sort((a, b) => b[1] - a[1]); const inactifs = inactifsListe.slice(0, 3).filter(x => !liste.length || x[1] > top * 1.3).map(([c, sc]) => resume(c, { score: Math.round(sc * 10) / 10, plus_remboursable: true }));
    if (!liste.length) return { ok: true, ...base, requete: brut, resultats: [], aucun: true, inactifs_proches: inactifs, termes_reconnus: reco, message: 'Je ne trouve pas de ligne qui corresponde à « ' + brut + ' » dans le Titre II de la LPP (' + (meta.version || '') + ').' + (reco.some(r => r.note) ? ' ' + reco.find(r => r.note).note : '') + ' Je n’invente jamais un code.' + (inactifs.length ? ' Des lignes proches existent mais leur prise en charge est terminée : ' + inactifs.map(i => i.code + ' (fin ' + i.fin_prise_en_charge + ')').join(', ') + '.' : '') };
    return { ok: true, ...base, requete: brut, resultats: liste.map(([c, s]) => resume(c, { score: Math.round(s * 10) / 10, pourquoi: [...(pourquoi.get(c.code) || [])].slice(0, 6) })), inactifs_proches: inactifs, termes_reconnus: reco, aucun: false };
  }

  /* ── 2. expliquer_code ── */
  const chaineSections = c => { const out = [], sec = sections.get(c.section); if (sec) { const ch = sec.chemin || []; for (let i = ch.length; i >= 1; i--) { const s = sections.get(idDe(ch.slice(0, i))); if (s) out.push(s); } } return out; };
  const idDe = chemin => { const t = norm(chemin.join(' > ')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90); return t || 'debut'; };
  function reglesDe(c) {
    const out = [], vu = new Set(); const ajouter = (r, source) => { const k = r.type + '|' + r.phrase; if (!vu.has(k)) { vu.add(k); out.push({ ...r, source }); } };
    for (const r of c.regles) ajouter(r, 'la ligne du code');
    for (const s of chaineSections(c)) for (const r of s.regles) if (PERTINENT.test(r.phrase) && !['age', 'prescripteur'].includes(r.type)) ajouter({ ...r }, 'la section « ' + s.titre + ' »' + (s.pages && s.pages[0] ? ' (page ' + s.pages[0] + ')' : ''));
    const ch = graphe.chapitres && graphe.chapitres[c.chapitre]; if (ch) for (const r of ch.regles || []) if (PERTINENT.test(r.phrase) && !['age', 'prescripteur'].includes(r.type)) ajouter({ ...r }, 'les dispositions générales du chapitre ' + c.chapitre);
    return out;
  }
  function compatibles(c, { limite = 25 } = {}) {
    if (c.type !== 'appareil') return { liste: [], note: 'Seuls les appareils de base ont des adjonctions.' };
    const fams = new Set(c.familles); const res = [];
    for (const a of codes) {
      if (!a.applicabilite || !actif(a)) continue;
      const ok = a.applicabilite.a_qui.some(f => fams.has(f)) || (a.membre && a.membre === c.membre && a.applicabilite.a_qui.length === 0);
      if (ok) res.push(a);
    }
    const groupes = {}; for (const a of res) { const k = a.rubrique || '(sans rubrique)'; (groupes[k] = groupes[k] || []).push(a.code); }
    return { liste: res.slice(0, limite).map(a => resume(a)), total: res.length, groupes: Object.entries(groupes).map(([rubrique, l]) => ({ rubrique, n: l.length })).sort((x, y) => y.n - x.n), note: 'Adjonctions et variantes POSSIBLES d’après les titres de leurs rubriques : à vérifier dans le texte officiel (indications qui précèdent l’appareil).' };
  }
  function expliquer(cle) {
    const brut = String(cle || '').trim(), m7 = brut.match(/\b\d{7}\b/), r = m7 ? parCode.get(m7[0]) : (parRef.get(norm(brut).replace(/[^a-z0-9]/g, '')) || [])[0];
    if (!r) return { ok: false, raison: 'Je ne trouve pas « ' + brut + ' » dans le Titre II de la LPP (' + (meta.version || '') + '). Je n’invente jamais un code.', rappel: A_VERIFIER };
    const regles = reglesDe(r), alertes = [];
    if (!actif(r)) alertes.push('La prise en charge de ce code s’est terminée le ' + r.fin_prise_en_charge + ' : il n’est plus remboursable.');
    if (regles.some(x => x.type === 'entente_prealable')) alertes.push('Un accord ou une entente préalable est mentionné dans les textes qui s’appliquent à ce code.');
    if (r.tarif_texte) alertes.push('Prix « ' + r.tarif_texte + ' » : à chiffrer sur devis, jamais deviné.');
    if (r.tarif == null && r.plv == null && !r.tarif_texte) alertes.push('Aucun tarif lisible pour cette ligne : je ne le devine pas, regarde le PDF page ' + r.page_pdf + '.');
    const tarif = { tarif: r.tarif, plv: r.plv, prix_cession_ht: r.prix_cession_ht, base_de_remboursement: r.tarif != null ? r.tarif : null, prix_limite_de_vente: r.plv };
    return { ok: true, version: meta.version, date_version: meta.date_version, ...resume(r), description: r.description, tarifs: tarif, regles, alertes, cite: r.cites.map(c => parCode.get(c)).filter(Boolean).map(c => ({ code: c.code, designation: c.designation })), compatibles: compatibles(r), lecture: r.lecture, rappel: A_VERIFIER };
  }

  /* ── 3. verifier_cumul ── */
  const PERTINENT = /prise en charge|factur|renouvel|garanti|cumul|accord pr|entente|devis|rembours|tarif|ne peut|peut [êe]tre associ|en suppl[ée]ment|en sus/i;
const NEGATIF = /ne peut|ne peuvent|n.est pas|non cumul|exclusi|incompatible|[àa] l.exclusion|ne se cumule|ne s.ajoute pas|pas (?:cumul|factur|associ)|interdit|sans pouvoir/i;
  const POSITIF = /peut [êe]tre (?:associ|ajout|cumul|factur)|peuvent [êe]tre (?:associ|ajout|cumul)|s.ajoute|se cumule|en suppl[ée]ment|en sus|possible de compl[ée]ter|compl[ée]t/i;
  function phrasesCumul(c) { return reglesDe(c).filter(r => r.type === 'cumul' || NEGATIF.test(r.phrase) && /cumul|associ|factur|ajout|suppl/i.test(r.phrase)); }
  function verifierCumul(listeCodes) {
    const l = [...new Set((listeCodes || []).map(x => String(x).trim()).filter(Boolean))], trouves = l.map(x => ({ x, c: parCode.get(x.match(/\d{7}/) ? x.match(/\d{7}/)[0] : '') || (parRef.get(norm(x).replace(/[^a-z0-9]/g, '')) || [])[0] || null }));
    const inconnus = trouves.filter(t => !t.c).map(t => t.x); if (inconnus.length) return { ok: false, raison: 'Je ne trouve pas dans la LPP : ' + inconnus.join(', ') + '. Je ne juge pas un cumul sur un code que je ne connais pas.', rappel: A_VERIFIER };
    if (trouves.length < 2) return { ok: false, raison: 'Il me faut au moins deux codes pour parler de cumul.', rappel: A_VERIFIER };
    const paires = [];
    for (let i = 0; i < trouves.length; i++) for (let j = i + 1; j < trouves.length; j++) {
      const A = trouves[i].c, B = trouves[j].c, cite = [];
      for (const [X, Y] of [[A, B], [B, A]]) {
        const cles = [Y.code, Y.reference].filter(Boolean);
        for (const r of phrasesCumul(X)) if (cles.some(k => r.phrase.includes(k))) cite.push({ ...r, vise: X.code + ' → ' + Y.code });
        for (const r of X.regles) if (r.type !== 'cumul' && cles.some(k => r.phrase.includes(k)) && (NEGATIF.test(r.phrase) || POSITIF.test(r.phrase))) cite.push({ ...r, vise: X.code + ' → ' + Y.code });
      }
      for (const [X, Y] of [[A, B], [B, A]]) {                                   // renvois : une phrase de la ligne X qui nomme le code ou la référence de Y
        const cles = [Y.code, Y.reference].filter(Boolean);
        for (const ph of phrases([X.designation, X.description].filter(Boolean).join('. '))) if (cles.some(k => ph.includes(k)) && !cite.some(r => r.phrase === ph)) cite.push({ type: 'renvoi', phrase: ph, source: 'la ligne du code ' + X.code, page: X.page_pdf, vise: X.code + ' → ' + Y.code });
      }
      let statut = 'aucune_regle', phrasesRetenues = cite;
      if (cite.length) statut = cite.some(r => NEGATIF.test(r.phrase)) ? 'interdit_cite' : (cite.some(r => POSITIF.test(r.phrase)) ? 'autorise_cite' : (cite.every(r => r.type === 'renvoi') ? 'renvoi_cite' : 'regle_citee'));
      else {
        const gen = [...phrasesCumul(A), ...phrasesCumul(B)].filter(r => /section|chapitre/.test(r.source)).slice(0, 3);
        if (gen.length) { statut = 'regle_generale'; phrasesRetenues = gen; }
      }
      const alertes = [];
      if (A.type === 'appareil' && B.type === 'appareil' && A.membre && A.membre === B.membre && A.familles.some(f => B.familles.includes(f))) alertes.push('Deux appareils de base pour le même membre : en général ils ne s’ajoutent pas, vérifie le texte de la section.');
      if (!actif(A) || !actif(B)) alertes.push('L’un des codes n’est plus remboursable (fin de prise en charge dépassée).');
      paires.push({ a: resume(A), b: resume(B), statut, phrases: phrasesRetenues.map(r => ({ phrase: r.phrase, source: r.source, page: r.page || null })), alertes });
    }
    return { ok: true, version: meta.version, date_version: meta.date_version, paires, rappel: A_VERIFIER + ' Un « aucune règle trouvée » ne prouve pas que le cumul soit permis.' };
  }

  /* ── 4. forfait_reparation ── */
  const VERBES_REPARATION = /\br[ée]par|remise en [ée]tat|entretien|r[ée]vision|casse|cass[ée]|abim|usur/i, VERBES_RENOUV = /renouvel|remplac|chang|neuf|nouvelle? |refaire|refait/i;
  function forfaitReparation(description) {
    const d = String(description || '').trim(); if (!d) return { ok: false, raison: 'Décris la réparation : par exemple « changement d’une articulation de hanche » ou « remplacement d’une sangle ».' };
    const nature = VERBES_REPARATION.test(d) && VERBES_RENOUV.test(d) ? 'ambigu' : VERBES_REPARATION.test(d) ? 'reparation' : VERBES_RENOUV.test(d) ? 'renouvellement' : 'ambigu';
    const objet = d.replace(/r[ée]paration|r[ée]parer|remplacement|remplacer|renouvellement|renouveler|changement|changer|d.une?|du|de la|de l.|des?\b/gi, ' ');
    const types = nature === 'renouvellement' ? ['piece', 'adjonction', 'variante', 'appareil', 'reparation', 'forfait', 'prestation'] : ['reparation', 'forfait', 'piece', 'prestation', 'adjonction', 'variante', 'appareil'];
    const r = chercher(objet.trim().length > 2 ? objet + ' ' + (nature === 'reparation' ? 'réparation' : '') : d, { limite: 12 });
    const reparation = [], pieces = [];
    const motsObjet = jetons(objet).filter(t => inv.has(t)); for (const x of (r.resultats || []).filter(y => y.score >= 10 && (!motsObjet.length || motsObjet.some(t => jetons((y.designation || '') + ' ' + (y.rubrique || '')).includes(t))))) { const c = parCode.get(x.code); const estRep = c.type === 'reparation' || c.type === 'forfait' || c.familles.includes('reparation') || /r[ée]paration|forfait/i.test(c.designation + ' ' + (c.description || '')); (estRep ? reparation : pieces).push({ x, c, estRep }); }
    const generiques = codes.filter(c => actif(c) && (c.type === 'reparation' || /r[ée]parations?\b/i.test(c.designation || '')) && /sur devis/i.test((c.tarif_texte || '') + ' ' + (c.designation || '') + ' ' + (c.description || ''))).slice(0, 3).map(c => resume(c));
    const candidats = nature === 'renouvellement' ? [...pieces, ...reparation] : [...reparation, ...pieces];
    const top = candidats.slice(0, 2);
    const ligne = ({ x, c }) => ({ ...x, regles: reglesDe(c).filter(r => ['renouvellement', 'garantie', 'reparation', 'sur_devis', 'entente_prealable', 'cumul'].includes(r.type)).slice(0, 5) });
    if (!top.length) return { ok: true, version: meta.version, nature, aucun: true, message: 'Je ne trouve pas de forfait ni de code de réparation qui corresponde à « ' + d + ' ». Je n’invente jamais un code.' + (generiques.length ? ' Il existe des codes de réparation « sur devis » plus généraux : ' + generiques.map(g => g.code).join(', ') + '.' : ''), generiques, rappel: A_VERIFIER };
    const deux = top.length === 2 && top[1].x.score >= top[0].x.score * 0.6;
    const difference = deux ? 'Le premier (' + top[0].x.code + ') est « ' + (top[0].x.designation || '') + '» à ' + (top[0].x.tarif_texte || formatEuro(top[0].x.tarif != null ? top[0].x.tarif : top[0].x.plv)) + ' ; le second (' + top[1].x.code + ') est « ' + (top[1].x.designation || '') + '» à ' + (top[1].x.tarif_texte || formatEuro(top[1].x.tarif != null ? top[1].x.tarif : top[1].x.plv)) + '. ' + (top[0].c.type !== top[1].c.type ? 'L’un est de type « ' + top[0].c.type + ' », l’autre « ' + top[1].c.type + ' » : réparation et renouvellement ne se facturent pas pareil.' : 'Même type : compare les rubriques (' + (top[0].x.rubrique || '?') + ' / ' + (top[1].x.rubrique || '?') + ').') : null;
    return { ok: true, version: meta.version, date_version: meta.date_version, nature, ambigu: deux || nature === 'ambigu', candidats: deux ? top.map(ligne) : [ligne(top[0])], difference, generiques, conseil: nature === 'ambigu' ? 'Je ne sais pas si c’est une réparation ou un renouvellement : réparation = remise en état d’une pièce existante (souvent sur devis, après la garantie) ; renouvellement = remplacement par une pièce ou un appareil neuf, avec une durée minimale de renouvellement.' : (nature === 'renouvellement' ? 'Renouvellement : vérifie la durée minimale avant de pouvoir refacturer.' : 'Réparation : vérifie la garantie du fabricant et de l’appareil (trois ans pour les appareils de la nomenclature, sauf exceptions).'), rappel: A_VERIFIER };
  }
  const info = () => ({ ok: true, version: meta.version, date_version: meta.date_version, nombre_codes: codes.length, url: meta.url, lacunes: meta.lacunes || [], rappel: A_VERIFIER });
  return { ok: true, meta, codes, parCode, parRef, sections, chercher, expliquer, verifierCumul, forfaitReparation, compatibles, reglesDe, reconnaitre, resume, phraseRef, actif, info, corrections: corr, aujourdhui: date };
}
export { extraireRegles };
