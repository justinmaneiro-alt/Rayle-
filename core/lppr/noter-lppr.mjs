// Note Raylé sur les cas de test de la LPPR (data/lppr/tests/cas.json) : % de bons codes, erreurs, « je ne trouve pas » justifiés. Écrit docs/LPPR_RESULTATS.md.
//   node core/lppr/noter-lppr.mjs            (ou : npm run test:lppr)
// Sortie : code 0 si TOUS les cas passent, 1 sinon (les cas faux sont listés : soit Raylé se trompe, soit le cas est à corriger par Justin).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerLppr } from './lppr-outils.js';
import { creerDevis } from './lppr-devis.js';

const ICI = path.dirname(fileURLToPath(import.meta.url)), RACINE = path.join(ICI, '..', '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));
export function evaluer(L, D, cas) {
  const a = cas.attendu, e = cas.entree, norm = s => String(s || '').toLowerCase();
  const out = { id: cas.id, ok: false, detail: '', categorie: null };
  const contient = (texte, liste) => (liste || []).every(m => norm(texte).includes(norm(m)));
  if (cas.outil === 'chercher') {
    const r = L.chercher(e, { limite: 8 });
    if (a.codes) { const rang = r.resultats.findIndex(x => a.codes.includes(x.code)) + 1; out.categorie = 'bon_code'; out.ok = rang > 0 && rang <= (a.rangMax || 3); out.detail = rang ? 'rang ' + rang : 'absent : ' + r.resultats.slice(0, 3).map(x => x.code).join(', '); }
    else if (a.aucunActif) {
      out.categorie = 'ne_trouve_pas_justifie'; const sansResultat = !r.resultats.length || r.aucun; let ok = sansResultat;
      if (a.inactifsNonVide) ok = ok && (r.inactifs_proches || []).length > 0; if (a.inactifsContient) ok = ok && a.inactifsContient.every(c => (r.inactifs_proches || []).some(x => x.code === c));
      if (a.messageContient) ok = ok && contient(r.message || '', a.messageContient); out.ok = ok; out.detail = sansResultat ? 'aucun résultat actif' + ((r.inactifs_proches || []).length ? ' ; lignes terminées : ' + r.inactifs_proches.map(x => x.code).join(', ') : '') : 'a trouvé : ' + r.resultats.slice(0, 2).map(x => x.code).join(', ');
    }
  } else if (cas.outil === 'expliquer') {
    const r = L.expliquer(e); out.categorie = 'explication'; let ok = r.ok;
    if (ok && a.reglesContiennent) ok = a.reglesContiennent.every(m => r.regles.some(x => norm(x.phrase).includes(norm(m)))); if (ok && a.alerteContient) ok = a.alerteContient.every(m => r.alertes.some(x => norm(x).includes(norm(m))));
    if (ok && a.champs) ok = Object.entries(a.champs).every(([k, v]) => r[k] === v); out.ok = ok; out.detail = r.ok ? r.regles.length + ' règle(s), ' + r.alertes.length + ' alerte(s)' : r.raison;
  } else if (cas.outil === 'cumul') {
    const r = L.verifierCumul(e); out.categorie = 'cumul';
    if (a.refus) { out.ok = !r.ok && contient(r.raison, a.messageContient); out.detail = r.raison || ''; }
    else { const p = r.ok ? r.paires[0] : null; let ok = !!p; if (ok && a.statuts) ok = a.statuts.includes(p.statut); if (ok && a.alerteContient) ok = a.alerteContient.every(m => p.alertes.some(x => norm(x).includes(norm(m)))); out.ok = ok; out.detail = p ? p.statut : r.raison; }
  } else if (cas.outil === 'reparation') {
    const r = L.forfaitReparation(e); out.categorie = 'reparation'; let ok = r.ok && !r.aucun;
    if (ok && a.codes) ok = a.codes.every(c => r.candidats.some(x => x.code === c)); if (ok && a.nature) ok = r.nature === a.nature; if (ok && a.montreDeux) ok = r.candidats.length === 2 && !!r.difference; out.ok = ok; out.detail = r.ok ? r.nature + ' : ' + (r.candidats || []).map(x => x.code).join(', ') : r.raison;
  } else if (cas.outil === 'devis') {
    const r = D.proposerDevis(e.description, e.reponses || {}); out.categorie = 'devis'; let ok = a.ok === false ? !r.ok : r.ok; if (ok && a.etape) ok = r.etape === a.etape;
    if (ok && a.questionsIds) ok = JSON.stringify(r.questions.map(q => q.id)) === JSON.stringify(a.questionsIds); if (ok && a.dejaCompris) ok = a.dejaCompris.every(k => r.deja_compris && r.deja_compris[k]);
    if (ok && a.ligneCodes) ok = a.ligneCodes.every(c => r.lignes.some(l => l.code === c)); if (ok && a.ligneFamille) ok = r.lignes.some(l => l.familles.includes(a.ligneFamille)); if (ok && a.aucuneLigne) ok = r.lignes.length === 0;
    if (ok && a.alertesGenre) ok = a.alertesGenre.every(g => r.alertes.some(x => x.genre === g)); out.ok = ok; out.detail = r.etape + (r.lignes ? ' : ' + r.lignes.map(l => l.code).join(', ') : '') + (r.questions ? ' ? ' + r.questions.map(q => q.id).join(',') : '');
  } else if (cas.outil === 'verifier_devis') {
    const r = D.verifierDevis(e.lignes, { description: e.description || '' }); out.categorie = 'verification'; let ok = r.ok;
    if (ok && a.problemeContient) ok = Object.entries(a.problemeContient).every(([code, m]) => r.lignes.some(l => String(l.code) === code && l.problemes.some(p => norm(p).includes(norm(m)))));
    if (ok && a.alertesGenre) ok = a.alertesGenre.every(g => r.alertes.some(x => x.genre === g)); out.ok = ok; out.detail = r.ok ? r.verdict : r.raison;
  }
  return out;
}
export function noter(L, D, cas) {
  const res = cas.map(c => ({ ...evaluer(L, D, c), famille: c.famille, outil: c.outil, entree: c.entree, reference: c.reference })), par = {};
  for (const r of res) { const p = par[r.categorie] || (par[r.categorie] = { n: 0, ok: 0 }); p.n++; if (r.ok) p.ok++; }
  return { res, par, ok: res.filter(r => r.ok).length, n: res.length };
}
const estPrincipal = () => { try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch (e) { return false; } };
if (estPrincipal()) {
  const g = lire('data/lppr/graphe.json'), v = lire('data/lppr/vocabulaire.json'), tests = lire('data/lppr/tests/cas.json');
  const L = creerLppr(g, { vocabulaire: v, aujourdhui: tests.meta.date_reference_tests }), D = creerDevis(L), { res, par, ok, n } = noter(L, D, tests.cas);
  for (const r of res) console.log((r.ok ? 'OK  ' : 'KO  ') + r.id + ' [' + r.outil + '] ' + (typeof r.entree === 'string' ? r.entree : JSON.stringify(r.entree)).slice(0, 70) + ' — ' + r.detail);
  const pct = (x, y) => (y ? Math.round(x / y * 100) : 0), bons = par.bon_code || { n: 0, ok: 0 }, nt = par.ne_trouve_pas_justifie || { n: 0, ok: 0 };
  const md = ['# Résultats du test LPPR de Raylé', '', '_Généré par `node core/lppr/noter-lppr.mjs` (ou `npm run test:lppr`) le ' + new Date().toISOString().slice(0, 10) + ' · nomenclature : ' + g.meta.version + ' · ' + g.meta.nombre_codes + ' codes · ' + n + ' cas, écrits à partir de la nomenclature et **à valider par Justin**._', '',
    '> **Attention à la note** : j’ai écrit ces cas en lisant la nomenclature, puis j’ai réglé Raylé (recherche, classement des familles, règles) jusqu’à ce qu’ils passent : une note de 100 % mesure la cohérence avec MA lecture du PDF, **pas** la validité métier. Les cas faux se corrigent dans `data/lppr/tests/cas.json` ; ajoute les tiens (anciens devis anonymisés dans `data/lppr/exemples-devis/`) : ce sont eux qui diront la vraie qualité.', '',
    '## Note', '','- **Bons codes** (la bonne ligne est dans les premiers résultats) : **' + bons.ok + ' sur ' + bons.n + ' (' + pct(bons.ok, bons.n) + ' %)**', '- **« Je ne trouve pas » justifiés** (famille sans ligne remboursable, code inexistant : Raylé le dit, liste les lignes terminées et n’invente rien) : **' + nt.ok + ' sur ' + nt.n + '**',
    ...Object.entries(par).filter(([k]) => !['bon_code', 'ne_trouve_pas_justifie'].includes(k)).map(([k, p]) => '- ' + k.replace('_', ' ') + ' : ' + p.ok + ' sur ' + p.n), '- **Total : ' + ok + ' sur ' + n + ' (' + pct(ok, n) + ' %)** · erreurs : ' + (n - ok), '',
    '## Détail', '', '| Cas | Outil | Famille | Entrée | Résultat | Détail | Référence |', '|---|---|---|---|---|---|---|', ...res.map(r => '| ' + r.id + ' | ' + r.outil + ' | ' + r.famille + ' | ' + (typeof r.entree === 'string' ? r.entree : JSON.stringify(r.entree)).replace(/\|/g, '/').slice(0, 80) + ' | ' + (r.ok ? 'OK' : '**ÉCHEC**') + ' | ' + String(r.detail).replace(/\|/g, '/').slice(0, 90) + ' | ' + String(r.reference).replace(/\|/g, '/') + ' |'), '',
    '## Ce qui reste incertain (à vérifier par toi)', '',
    '- **Lignes terminées** : la plupart des anciennes lignes à référence alphanumérique (PI, PS, OS, TR…, chapitre 1) ont une date de fin de prise en charge dépassée (2017 à 2025). Raylé les signale « plus remboursable » et ne les propose pas dans un devis ; **je ne sais pas par quelles lignes elles ont été remplacées** (le PDF ne le dit pas toujours) : à compléter par ton savoir métier.',
    '- **Corsets, minerves, attelles de main, releveurs, sièges** : aucune ligne REMBOURSABLE trouvée dans ce Titre II (lignes terminées ou autre titre de la LPP). Si tu en facturais récemment, c’est qu’ils sont dans une autre partie de la LPP que je n’ai pas lue (Titre I, IV…), ou que la lecture automatique a manqué une ligne : dis-le-moi avec le code.',
    '- **Chapitres 2 à 7** : j’ai gardé tout le Titre II (chapitres 1 à 7). Le chapitre 7 (orthoprothèses) est le cœur du grand appareillage ; le chapitre 1 contient les corsets et orthèses « petit appareillage » (terminés pour la plupart) ; les chapitres 2 à 5 (optique, audioprothèse, prothèses externes non orthopédiques, oculaires) ne te concernent pas mais restent consultables.',
    '- **Adjonctions compatibles** : déduites des TITRES de rubrique (« adjonctions communes aux prothèses de membres inférieurs ») : proposées « possibles, à vérifier », jamais certaines.',
    '- **Vocabulaire** : écrit de mémoire par Raylé (`data/lppr/vocabulaire.json`) ; les termes douteux sont marqués ; corrige-les à la voix (« non, ça c’est un autre code »).',
    '- **Règles** : ce sont des phrases du texte classées par mots-clés ; la phrase citée fait foi, pas le classement. Les règles générales d’un chapitre (accord préalable : formulaire S3604d…) ne sont lues que quand elles sont dans le texte de la section ou du chapitre.',
    '- **Extraction du PDF** : 3 codes (stimulateur phrénique) non extraits (hors champ) ; quelques lignes lues en texte libre (prix par motif) sont marquées `lecture: texte` ; voir `data/lppr/graphe-rapport.md`.', '',
    '*À vérifier avec la nomenclature en vigueur. Les cas sont des exemples : aucun n’est un devis réel, aucune donnée de patient n’est utilisée.*'];
  fs.mkdirSync(path.join(RACINE, 'docs'), { recursive: true }); fs.writeFileSync(path.join(RACINE, 'docs', 'LPPR_RESULTATS.md'), md.join('\n') + '\n');
  console.log('\n' + ok + ' / ' + n + ' cas réussis (' + pct(ok, n) + ' %) ; bons codes ' + bons.ok + '/' + bons.n + ' ; « je ne trouve pas » justifiés ' + nt.ok + '/' + nt.n + ' → docs/LPPR_RESULTATS.md');
  process.exit(ok === n ? 0 : 1);
}
