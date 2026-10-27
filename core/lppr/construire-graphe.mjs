// Fabrique le GRAPHE DE CONNAISSANCES de la LPPR (Titre II) à partir de l'extraction structurée du PDF officiel.
//   python -I planetes/neptune/outils/lppr-graphe.py data/lppr/source/LPP-071026.pdf 2026-10-07     → data/lppr/graphe-brut.json
//   node core/lppr/construire-graphe.mjs                                                           → data/lppr/graphe.json  (+ data/lppr/graphe-rapport.md : ce qui est incertain)
// Chaque information garde sa référence (page du PDF, chapitre, section). Rien n'est inventé : un champ illisible reste vide.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireRegles, codesCites, referencesCitees, typeDe, membreDe, famillesDe, rubriqueDe, actifLe, norm } from './lppr-regles.js';

const ICI = path.dirname(fileURLToPath(import.meta.url)), RACINE = path.join(ICI, '..', '..');
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

/* À quels appareils une adjonction s'applique-t-elle ? D'après les TITRES de sa rubrique (« Adjonctions communes aux prothèses de membres supérieurs », « … pour prothèses endosquelettiques »…). */
export function applicabilite(c) {
  const t = norm((c.chemin || []).slice(1).join(' ') + ' ' + (c.designation || '')), a = new Set();
  const sup = /membres? superieurs?/.test(t) || c.membre === 'membre_superieur', inf = /membres? inferieurs?/.test(t) || c.membre === 'membre_inferieur';
  if (/prothes/.test(t) || /^(?:AS|AI|VI|VS)/.test(c.reference || '')) { if (sup) a.add('prothese_membre_superieur'); if (inf) a.add('prothese_membre_inferieur'); }
  if (/orthop|orthese/.test(t)) { if (sup) a.add('orthese_membre_superieur'); if (inf) a.add('orthese_membre_inferieur'); }
  const sous = []; if (/exosquelett/.test(t)) sous.push('exosquelettique'); if (/endosquelett/.test(t)) sous.push('endosquelettique'); if (/travail et de service/.test(t)) sous.push('travail_et_service'); if (/myoelectri/.test(t)) sous.push('myoelectrique');
  return { a_qui: [...a], sous_types: sous, communes: /communes?/.test(t) };
}

export function construire(brut, { dateRef = null } = {}) {
  const date = dateRef || brut.meta.date_version || new Date().toISOString().slice(0, 10), vus = new Map(), doublons = [];
  for (const c of brut.codes) { if (vus.has(c.code)) { doublons.push(c.code); continue; } vus.set(c.code, c); }
  const sections = new Map(), chapitres = {};
  const sectionDe = ch => { const id = slug(ch.join(' > ')) || 'debut'; if (!sections.has(id)) sections.set(id, { id, chemin: ch, titre: ch[ch.length - 1] || '', regles: [], texte: [], pages: [], codes: 0 }); return sections.get(id); };
  for (const s of brut.sections) {
    const ch = s.chemin === '(début)' ? [] : s.chemin.split(' > '), sec = sectionDe(ch); sec.pages = [...new Set([...sec.pages, ...s.pages])];
    const txt = s.texte.filter(l => !/^\d{7}\s/.test(l) && !/^(?:Chapitre|Section|Sous-section|§|Titre)\b/i.test(l)).join('\n'); if (txt) sec.texte.push(txt);   // ni les lignes de codes, ni les titres : seulement le texte des dispositions
  }
  for (const sec of sections.values()) {
    const brutTxt = sec.texte.join('\n'); sec.regles = extraireRegles(brutTxt, 'section', sec.pages[0] || null).slice(0, 60);
    sec.texte = brutTxt.length > 5000 ? brutTxt.slice(0, 5000) + '…' : brutTxt;
    const m = /^(?:Chapitre\s+)?([1-7])\b/.exec(sec.chemin[0] || ''); sec.chapitre = m ? m[1] : null;
  }
  const codes = [];
  for (const c of vus.values()) {
    const sec = sectionDe(c.chemin || []), type = typeDe(c), membre = membreDe(c), rubrique = rubriqueDe(c.chemin);
    const texteComplet = [c.designation, c.description].filter(Boolean).join('. '), cites = codesCites(texteComplet).filter(x => x !== c.code && vus.has(x)), refs = referencesCitees(texteComplet);
    const rec = { chemin_complet: (c.chemin || []).slice(1).filter(x => x.length < 140), code: c.code, reference: c.reference || null, designation: c.designation || null, description: c.description || null, chapitre: c.chapitre, section: sec.id, rubrique, type, membre,
      familles: famillesDe({ ...c, type }), tarif: c.tarif, plv: c.plv, prix_cession_ht: c.prix_cession_ht, tarif_texte: c.tarif_texte || (c.tarif_brut && /devis|facture/i.test(c.tarif_brut) ? c.tarif_brut : null), fin_prise_en_charge: c.fin_prise_en_charge,
      actif: actifLe(c, date), page_pdf: c.page_pdf, lecture: c.lecture || 'tableau', regles: extraireRegles(texteComplet, 'code', c.page_pdf), cites, references_citees: refs };
    if (type === 'adjonction' || type === 'variante' || type === 'piece' || type === 'supplement') rec.applicabilite = applicabilite({ ...c, type, membre });
    sec.codes++; codes.push(rec);
  }
  const parRef = new Map(); for (const c of codes) if (c.reference) { const l = parRef.get(c.reference) || []; l.push(c.code); parRef.set(c.reference, l); }
  const aretes = [];
  for (const c of codes) {
    for (const v of c.cites) aretes.push({ de: c.code, vers: v, type: 'cite_le_code' });
    for (const r of c.references_citees) for (const v of parRef.get(r) || []) if (v !== c.code) aretes.push({ de: c.code, vers: v, type: 'cite_la_reference' });
  }
  for (const sec of sections.values()) {
    const m = /^(?:Chapitre\s+)?([1-7])\b/.exec(sec.chemin[0] || ''); chapitres[m ? m[1] : 'autre'] = chapitres[m ? m[1] : 'autre'] || { titre: m ? (brut.meta.chapitres[m[1]] || sec.chemin[0]) : 'Hors chapitre', regles: [], pages: [] };
  }
  for (const sec of sections.values()) if (sec.chemin.length <= 1 && sec.chapitre && chapitres[sec.chapitre]) { chapitres[sec.chapitre].regles.push(...sec.regles); chapitres[sec.chapitre].pages = [...new Set([...chapitres[sec.chapitre].pages, ...sec.pages])]; }
  const utiles = [...sections.values()].filter(s => s.codes || s.regles.length || s.texte.length > 80);
  const lacunes = [];
  const attendus = (brut.attendus || []);
  if (doublons.length) lacunes.push(doublons.length + ' code(s) présent(s) deux fois dans le PDF : le premier est gardé (' + doublons.slice(0, 5).join(', ') + (doublons.length > 5 ? '…' : '') + ').');
  lacunes.push('Les 3 codes du stimulateur phrénique (page 1023, tableau à en-tête atypique) ne sont pas extraits : hors champ de l’orthoprothèse.');
  const sansTarif = codes.filter(c => c.tarif == null && c.plv == null && !c.tarif_texte).length;
  if (sansTarif) lacunes.push(sansTarif + ' code(s) sans tarif ni prix limite lisible (cellule vide ou tableau particulier) : le prix n’est jamais deviné.');
  const textes = codes.filter(c => c.lecture === 'texte').length; if (textes) lacunes.push(textes + ' ligne(s) lue(s) en texte libre (hors tableau) : prix et date lus par motifs, marqués « lecture: texte ».');
  void attendus;
  return { meta: { ...brut.meta, schema: 1, nombre_codes: codes.length, nombre_sections: utiles.length, construit_le: new Date().toISOString().slice(0, 10), date_reference: date, lacunes }, chapitres,
    sections: utiles.map(s => ({ id: s.id, chemin: s.chemin, titre: s.titre, chapitre: s.chapitre, pages: s.pages, codes: s.codes, regles: s.regles, texte: s.texte })), codes, aretes };
}

const estPrincipal = () => { try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch (e) { return false; } };
if (estPrincipal()) {
  const entree = process.argv[2] || path.join(RACINE, 'data', 'lppr', 'graphe-brut.json'), sortie = process.argv[3] || path.join(RACINE, 'data', 'lppr', 'graphe.json');
  if (!fs.existsSync(entree)) { console.log('Il manque ' + entree + ' : lance d’abord  python -I planetes/neptune/outils/lppr-graphe.py data/lppr/source/LPP-AAAAMMJJ.pdf AAAA-MM-JJ'); process.exit(1); }
  const g = construire(JSON.parse(fs.readFileSync(entree, 'utf8')));
  fs.writeFileSync(sortie, JSON.stringify(g));
  const par = {}; for (const c of g.codes) par[c.type] = (par[c.type] || 0) + 1;
  const rapport = ['# Graphe LPPR : ce qui est incertain', '', 'Version : ' + g.meta.version + ' · ' + g.meta.nombre_codes + ' codes · ' + g.meta.nombre_sections + ' sections · ' + g.aretes.length + ' liens.', '', '## Types', ...Object.entries(par).map(([k, v]) => '- ' + k + ' : ' + v), '', '## Lacunes connues', ...g.meta.lacunes.map(x => '- ' + x), '',
    '## Limites', '- Les liens appareil → adjonctions sont **déduits des titres de rubrique** (« adjonctions communes aux prothèses de membres inférieurs… ») ou des citations explicites de codes ; ils sont proposés comme « possibles, à vérifier dans le texte officiel », jamais comme certains.',
    '- Les titres de sections viennent d’une lecture automatique du PDF : quelques listes (matériaux, niveaux d’amputation) peuvent apparaître comme des sous-titres.', '- Les règles sont des PHRASES du texte classées par mots-clés (renouvellement, garantie, accord préalable, cumul…) : la phrase citée fait foi, pas le classement.'];
  fs.writeFileSync(path.join(path.dirname(sortie), 'graphe-rapport.md'), rapport.join('\n') + '\n');
  console.log('écrit', sortie, '(' + Math.round(fs.statSync(sortie).size / 1024) + ' Ko) ;', JSON.stringify(par));
}
