import { sansPonctuation } from './lppr-regles.js';
import { formatEuro, A_VERIFIER } from './lppr-outils.js';

/* ═════════════ LPPR : LA VOIX (module pur, testé : galaxie/tests/lppr-graphe-test.mjs) ═════════════
   `detecter(texte)` reconnaît les demandes (sans IA) ; `dire*` fabrique la phrase parlée : courte, sans markdown ni émoji, avec la RÉFÉRENCE (chapitre, page) et le rappel « à vérifier ».
   Une réponse parlée ne donne que les deux meilleurs résultats : le reste est dans la fenêtre. Jamais de code ni de prix deviné. */
export function detecter(texte) {
  const t = sansPonctuation(texte); if (!t) return null;
  const codes = t.match(/\b\d{7}\b/g) || [];
  if (/\b(?:ouvre|affiche|montre)\b.*\b(?:lppr?|nomenclature)\b/.test(t) && !codes.length) return { type: 'fenetre' };
  // corrections du vocabulaire
  let m = /\bpour (.+?) c est (?:le )?code (\d{7})\b/.exec(t); if (m) return { type: 'correction_code', terme: m[1].trim(), code: m[2] };
  m = /\b(?:ce n est pas|ce n est plus|c est pas) (?:le )?(?:code )?(\d{7})\b(?: pour (.+))?/.exec(t); if (m) return { type: 'correction_exclure', code: m[1], terme: m[2] ? m[2].trim() : null };
  if (/^non\b/.test(t) && /\b(?:autre code|pas (?:le|ce) (?:bon )?code|pas celui|pas ca|ce n est pas ca)\b/.test(t)) return { type: 'correction_exclure', code: codes[0] || null, terme: null };
  if (!/\b(?:lppr?|lpp|nomenclature|devis|cumul\w*|r[ée]paration\w*|forfait\w*)\b/.test(t) && !codes.length) return null;
  if (/\bv[ée]rifi\w*\b.*\bdevis\b/.test(t)) return { type: 'verifier_devis', codes };
  if (/\b(?:forfait\w*|code)\b.*\br[ée]par\w*|\br[ée]par\w*\b.*\b(?:forfait|code|lppr?|lpp)\b|\bforfait\w* de r[ée]par\w*/.test(t) || (/\br[ée]par\w*|remise en etat/.test(t) && /\b(?:lppr?|lpp|nomenclature|prothese|orthese|emboiture|pied|genou|hanche|coude|sangle|manchon|appareil|corset)\b/.test(t))) return { type: 'reparation', texte: t.replace(/\b(?:quel|quelle|est|le|la|les|forfait|forfaits|code|lppr?|lpp|nomenclature|pour|de|du|des|d|l|un|une|donne|moi|dis)\b/g, ' ').replace(/\s+/g, ' ').trim() || t };
  if (/\bcumul\w*|\bassoci\w*\b|en meme temps|ensemble\b/.test(t) && codes.length >= 2) return { type: 'cumul', codes };
  if (/\bdevis\b/.test(t)) return { type: 'devis', texte: t.replace(/^.*?\bdevis\b\s*(?:pour|de|d|:)?\s*/, '').trim() };
  if (/\b(?:explique|detail\w*|c est quoi|que dit|conditions?)\b/.test(t) && codes.length === 1) return { type: 'expliquer', code: codes[0] };
  if (codes.length === 1 && /\b(?:lppr?|lpp|code)\b/.test(t)) return { type: 'expliquer', code: codes[0] };
  if (/\b(?:lppr?|lpp|nomenclature)\b/.test(t)) { const q = t.replace(/\b(?:ouvre|affiche|montre|cherche|trouve|donne|dis|quel|quelle|quels|est|le|la|les|des|du|de|d|l|code|codes|lppr?|lpp|nomenclature|moi|pour|sur|dans|a|un|une)\b/g, ' ').replace(/\s+/g, ' ').trim(); return q ? { type: 'chercher', q } : { type: 'fenetre' }; }
  return null;
}
const prix = r => (r.tarif_texte && r.tarif == null && r.plv == null ? r.tarif_texte : (r.tarif != null ? 'tarif ' + formatEuro(r.tarif) : '') + (r.plv != null ? (r.tarif != null ? ', ' : '') + 'prix limite ' + formatEuro(r.plv) : (r.tarif == null ? 'prix non lu' : '')));
const nombre = n => n.toString();
export function direChercher(rep) {
  if (!rep.ok) return rep.raison;
  if (rep.aucun) return rep.message + ' ' + A_VERIFIER;
  const l = rep.resultats.slice(0, 2).map(r => 'Code ' + r.code + (r.reference ? ' (' + r.reference + ')' : '') + ' : ' + (r.designation || 'désignation non lue').replace(/\.$/, '') + ', ' + prix(r) + (r.actif ? '' : ', mais PLUS REMBOURSABLE depuis le ' + r.fin_prise_en_charge) + '. ' + r.reference_texte + '.');
  const suite = rep.resultats.length > 2 ? ' Il y a ' + (rep.resultats.length - 2) + ' autre' + (rep.resultats.length > 3 ? 's' : '') + ' résultat' + (rep.resultats.length > 3 ? 's' : '') + ' dans la fenêtre.' : '';
  const inc = (rep.termes_reconnus || []).filter(t => t.incertain)[0];
  return l.join(' ') + suite + (inc ? ' Attention, le mot « ' + inc.mot + ' » est dans mon dictionnaire avec un doute : dis-moi si ce n’est pas le bon code.' : '') + ' ' + A_VERIFIER;
}
export function direExpliquer(rep) {
  if (!rep.ok) return rep.raison;
  const l = ['Code ' + rep.code + (rep.reference ? ' (' + rep.reference + ')' : '') + ' : ' + (rep.designation || '').replace(/\.$/, '') + '. ' + prix(rep) + '.', rep.reference_texte + '.'];
  for (const a of rep.alertes.slice(0, 3)) l.push(a);
  const cles = rep.regles.filter(r => ['renouvellement', 'garantie', 'entente_prealable', 'cumul'].includes(r.type)).slice(0, 2); for (const r of cles) l.push('Règle (' + r.type.replace('_', ' ') + ', ' + r.source + ') : ' + r.phrase);
  if (rep.compatibles && rep.compatibles.total) l.push('Il existe ' + rep.compatibles.total + ' adjonction' + (rep.compatibles.total > 1 ? 's' : '') + ' ou variante' + (rep.compatibles.total > 1 ? 's' : '') + ' possible' + (rep.compatibles.total > 1 ? 's' : '') + ' : ouvre la fenêtre pour la liste à vérifier.');
  l.push(A_VERIFIER); return l.join(' ');
}
const STATUTS = { interdit_cite: 'le texte indique que ces deux lignes ne se cumulent pas', autorise_cite: 'le texte autorise l’association', regle_citee: 'une règle de cumul est citée', renvoi_cite: 'le texte de l’un des deux codes renvoie à l’autre', regle_generale: 'une règle générale de cumul existe dans la section', aucune_regle: 'je ne trouve aucune règle écrite, ce qui ne prouve pas que ce soit permis' };
export function direCumul(rep) {
  if (!rep.ok) return rep.raison;
  return rep.paires.map(p => p.a.code + ' avec ' + p.b.code + ' : ' + STATUTS[p.statut] + (p.phrases[0] ? ' : « ' + p.phrases[0].phrase + ' » (' + p.phrases[0].source + ')' : '') + '.' + (p.alertes.length ? ' ' + p.alertes.join(' ') : '')).join(' ') + ' ' + rep.rappel;
}
export function direReparation(rep) {
  if (!rep.ok) return rep.raison;
  if (rep.aucun) return rep.message + ' ' + A_VERIFIER;
  const c = rep.candidats.map(x => 'Code ' + x.code + ' : ' + (x.designation || '').replace(/\.$/, '') + ', ' + prix(x) + '.').join(' ');
  return (rep.ambigu && rep.candidats.length > 1 ? 'Deux codes sont plausibles. ' : '') + c + (rep.difference ? ' ' + rep.difference : '') + ' ' + rep.conseil + ' ' + A_VERIFIER;
}
export function direDevis(rep) {
  if (!rep.ok) return rep.raison;
  if (rep.etape === 'questions') return 'Pour ' + rep.appareil + ', il me manque : ' + rep.questions.map(q => q.texte).join(' ');
  const l = rep.lignes.map(x => x.role + ' : code ' + x.code + ', ' + (x.designation || '').replace(/\.$/, '') + ', ' + prix(x)).join('. ');
  return 'Proposition pour ' + rep.appareil + ' : ' + (l || 'aucune ligne active trouvée') + '. ' + (rep.totaux.base_remboursement_estimee ? 'Base de remboursement estimée : ' + formatEuro(rep.totaux.base_remboursement_estimee) + '. ' : '') + (rep.alertes.length ? 'Points d’attention : ' + rep.alertes.slice(0, 3).map(a => a.texte).join(' ') + ' ' : '') + 'À confirmer ligne par ligne. ' + A_VERIFIER;
}
export function direVerification(rep) {
  if (!rep.ok) return rep.raison;
  const pb = rep.lignes.filter(l => !l.ok).map(l => l.code + ' : ' + l.problemes.join(' ')); return 'Vérification du devis : ' + rep.verdict + '. ' + pb.join(' ') + (rep.alertes.length ? ' ' + rep.alertes.slice(0, 3).map(a => a.texte).join(' ') : '') + ' ' + rep.rappel;
}
export { nombre };
