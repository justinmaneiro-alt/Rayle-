/* ═════════════ HORAIRES ET RETARD PAR INSTRUMENT (pur, testé) ═════════════
   L'or garde ses règles d'origine (temps-or.js). Les autres instruments : crypto 24 h/24 ; indices et devises fermés le week-end ;
   « marché probablement fermé » quand la source n'a rien de nouveau depuis longtemps (séance terminée) — jamais une panne annoncée à tort. */
import { heureLocale } from './temps-or.js';
const MIN = 60e3;
export function marcheInstrument(inst, n, tDernier = null) {
  if (inst.continu) return { ouvert: true, raison: null, texte: null };
  const { j, h } = heureLocale(n, 'America/New_York');
  if (j === 6 || (j === 5 && h >= 17) || (j === 0 && h < 17)) return { ouvert: false, raison: 'week-end', texte: `Marché fermé (week-end) : ${inst.nom} ne cote plus jusqu’à dimanche soir.` };
  const seuil = inst.volume === 'aucun' && /^\^/.test(inst.yahoo || '') ? 150 * MIN : 40 * MIN;
  if (tDernier && n - tDernier > seuil) return { ouvert: false, raison: 'pause', texte: `Pas de nouvelle donnée sur ${inst.nom} depuis ${Math.round((n - tDernier) / MIN)} min : séance terminée ou pause probable.` };
  return { ouvert: true, raison: null, texte: null };
}
export function retardInstrument(inst, tDernier, n, ouvert) {
  if (!tDernier) return { enRetard: true, minutes: null, texte: `Aucune donnée reçue pour ${inst.nom}.` };
  const m = Math.round((n - tDernier) / MIN), seuil = /différé/.test(inst.retard) ? 25 : 8;
  return ouvert && m > seuil ? { enRetard: true, minutes: m, texte: `Donnée ${inst.nom} en retard : dernière mise à jour il y a ${m} min (${inst.retard}).` } : { enRetard: false, minutes: m, texte: null };
}
