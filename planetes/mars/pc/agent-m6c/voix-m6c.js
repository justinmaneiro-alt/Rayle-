/* ═════════════ VOIX DE RAYLÉ POUR L'ASSISTANT DE RÉGIME (M6c ; module pur, testé : m6c-assistant-test.mjs) ═════════════
   Reconnaît les phrases sur le régime de marché (range, tendance, cassure, « ça craint ») et fabrique la réponse à partir de l'analyse structurée (assistant-regime.js). Aucune IA : des modèles de phrases.
   Rayle est la seule voix. Une règle qui n'a pas battu le hasard est dite « information » : jamais présentée comme un signal. */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’\-\/]/g, ' ').replace(/[?!.,;…«»"]/g, ' ').replace(/\s+/g, ' ').trim();
const PAIRES = [['dogecoin', 'DOGE'], ['doge', 'DOGE'], ['solana', 'SOL'], ['sol', 'SOL'], ['bitcoin', 'BTC'], ['btc', 'BTC']];
const paireDe = t => { for (const [m, p] of PAIRES) if (new RegExp('\\b' + m + '\\b').test(t)) return p; return null; };

export function detecterM6c(phrase) {
  const t = norm(phrase); if (!t) return null; const paire = paireDe(t);
  if (/\b(?:fausse cassure|faux breakout|balayage de liquidite)\b/.test(t)) return { type: 'regime_m6c', sujet: 'fausse_cassure', paire };
  if (/\bcassure\b.*\b(?:valide|valable|de qualite|confirmee)\b|\by a t il une cassure\b|\bcassure en cours\b|\bune cassure\b.*\b(?:range|bornes?)\b/.test(t)) return { type: 'regime_m6c', sujet: 'cassure', paire };
  if (/\bca craint\b|\bsortie conseillee\b|\bdois je sortir\b|\bfaut il sortir\b|\bet si je sors\b|\bje devrais sortir\b/.test(t)) return { type: 'regime_m6c', sujet: 'craint', paire };
  if (/\b(?:bornes?|limites?|haut et bas)\b.*\brange\b|\brange\b.*\b(?:bornes?|entre quoi|entre combien)\b|\bou (?:est|sont) (?:le|les) (?:range|bornes?)\b/.test(t)) return { type: 'regime_m6c', sujet: 'bornes', paire };
  if (/\b(?:on est|est ce qu on est|sommes nous|suis je) en (?:range|tendance)\b|\best ce un range\b|\by a t il un range\b|\bregime actuel\b|\bquel regime\b.*\b(?:en ce moment|actuel|maintenant|la)\b|\bassistant de regime\b|\betat du marche\b/.test(t) && !/\bscore\b/.test(t)) return { type: 'regime_m6c', sujet: 'etat', paire };
  return null;
}

/* a = résultat de analyserAssistant ; tab = tableauM6c(paire) (facultatif, pour dire si une règle bat le hasard). */
export function repondreM6c(det, a, tab = null) {
  if (!a || !a.ok) return 'Je ne peux pas lire le régime pour l’instant : ' + (a && a.erreur ? a.erreur : 'données absentes') + '.';
  const fmt = x => Math.round(x).toLocaleString('fr-FR'), r = a.regime, nom = a.nom, signalInfo = tab && !tab.regles.some(x => x.statut === 'SIGNAL') ? ' Attention : aucune règle d’entrée n’a encore battu le hasard, donc je décris le marché, je ne propose pas d’entrée.' : '';
  switch (det.sujet) {
    case 'bornes': return r.code === 3 ? 'Le range de ' + nom + ' : borne basse ' + fmt(r.bas) + ', borne haute ' + fmt(r.haut) + ', ' + r.touchesBas + ' touches en bas et ' + r.touchesHaut + ' en haut, depuis ' + Math.round(r.ageH) + ' heures. Je ne propose rien tant qu’on est dedans.' : 'Pas de range sur ' + nom + ' en ce moment : le régime est ' + r.nom + '.';
    case 'cassure': {
      const c = a.regles.find(x => x.id === 'cassure_range'); const alerte = a.alertes.find(x => x.strategie === 'm6c:cassure_range');
      if (alerte) return alerte.texte.replace(/^INFORMATION \(règle non validée, aucune entrée proposée\) · /, 'Cassure valide, volume confirmé : ') + (c && c.statut !== 'SIGNAL' ? ' C’est de l’information : cette règle n’a pas encore battu le hasard.' : '');
      return 'Pas de cassure de qualité en cours sur ' + nom + '.' + (r.code === 3 ? ' On est en range entre ' + fmt(r.bas) + ' et ' + fmt(r.haut) + '.' : '');
    }
    case 'fausse_cassure': { const f = a.alertes.find(x => x.cle && String(x.cle).startsWith('fausse')); return f ? f.texte : 'Aucune fausse cassure récente sur ' + nom + '.' + (tab && tab.cassures ? ' Sur l’historique, le mode retest en a évité ' + tab.cassures.evitees + ' que le mode immédiat aurait subies.' : ''); }
    case 'craint': { const s = a.alertes.find(x => x.type === 'SORTIE' || (x.type === 'ATTENTION' && String(x.cle).startsWith('sortie'))); return s ? s.texte : 'Rien qui craint pour l’instant sur ' + nom + ' : ' + r.nom + (a.sortie && a.sortie.raisons.length ? ', avec quand même ' + a.sortie.raisons.length + ' signe de faiblesse (' + a.sortie.raisons[0].texte + ')' : '') + '.'; }
    default: return (r.code === 3 ? 'On est en range entre ' + fmt(r.bas) + ' et ' + fmt(r.haut) + ' sur ' + nom + ', je ne propose rien.' : nom + ' : ' + r.phrase) + signalInfo;
  }
}
export const normaliserM6c = norm;
