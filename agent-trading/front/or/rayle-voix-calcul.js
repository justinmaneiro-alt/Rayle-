/* Réponses de Rayle (voix et texte) pour la stratégie Rayle v1 : construites UNIQUEMENT à partir des valeurs réelles calculées, avec les fréquences mesurées, n et la valeur du hasard à côté,
   sans jamais dire d'acheter ou de vendre. Pur et testé. « Scénarios, pas prévisions. » */
import { phrasesMesure } from './rayle-modele-calcul.js';
import { mentionValidation } from './carnet-lecture-v1.js';
import { interpreterStrategie } from './rayle-voix-interp.js';
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
const hp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
export const RAPPEL = 'Scénarios, pas prévisions.';

export { interpreterStrategie };
export function repondreMa({ res, B, stats, texteMa }) {
  if (!res || !B || !B.length) return 'Je n’ai pas encore assez de bougies H1 pour lire la moyenne mobile.';
  const L = [texteMa]; const e = res.etat.dernier;
  if (e && e.type !== 'expiree') { const m = phrasesMesure(stats, e)[0]; L.push(`Pour ce type d’événement : ${m}.`); }
  L.push('Lecture en observation : aucune règle automatique n’a prouvé d’avantage sur l’or.'); return L.join(' ');
}
export function repondreCarnet({ lecture, zone, compte = 0 }) {
  if (!lecture) return 'Le prix n’est près d’aucune boîte (à plus de 0,25 ATR) : je ne lis pas le carnet pour l’instant. À l’arrivée sur une boîte, je donne le déséquilibre, le flux exécuté et les murs.';
  return `${lecture.texte}. ${mentionValidation(compte)}.`;
}
export function repondreFeuille({ feuille, rapport }) {
  if (!feuille || !feuille.contexte) return 'Pas de contexte : le prix n’est près d’aucune boîte, la feuille de décision reste grise. C’est une information, jamais un ordre.';
  const ok = feuille.conditions.filter(c => c.ok).map(c => c.libelle), non = feuille.conditions.filter(c => !c.ok).map(c => c.libelle);
  return `${feuille.texte}. Réunies : ${ok.length ? ok.join(' ; ') : 'aucune'}. Grises : ${non.length ? non.join(' ; ') : 'aucune'}. ${rapport ? rapport + ' ' : ''}Information seulement, jamais un ordre.`;
}
export function repondreScenarios({ sv, fiabilite }) {
  if (!sv) return `Je n’ai pas encore de scénarios (il me faut des bougies H1 et les mesures). ${RAPPEL}`;
  const nom = sv.horizon === '1j' ? 'un jour' : sv.horizon === '3j' ? 'trois jours' : 'une semaine';
  const L = [`Sur ${nom}, recalculés à la clôture de la bougie H1 du ${hp(sv.tPose - 3600e3)} :`];
  for (const a of sv.actifs) L.push(`${a.etiquette}. ${a.detail[0]}`);
  if (sv.contexte && sv.contexte.length) L.push(`Contexte non validé, hors probabilité : ${sv.contexte.join(' ; ')}.`);
  const f = fiabilite && fiabilite.horizons && fiabilite.horizons[sv.horizon]; if (f) L.push(f.phrase);
  L.push(RAPPEL); return L.join(' ');
}
export function expliqueScenario({ sv, lettre }) {
  const a = sv && sv.actifs.find(x => x.id === lettre); if (!a) return `Je n’ai pas de scénario ${lettre} pour l’instant. ${RAPPEL}`;
  return `${a.etiquette}. ${a.detail.join('. ')}. ${a.condition}. ${RAPPEL}`;
}
