import { sansPonctuation } from './lppr-regles.js';

/* ═════════════ VOCABULAIRE DE JUSTIN : CORRECTIONS (module pur, testé : galaxie/tests/lppr-graphe-test.mjs) ═════════════
   Le dictionnaire de départ (data/lppr/vocabulaire.json) est écrit de mémoire : des correspondances « mot de métier → mots de la nomenclature » peuvent être fausses. Justin les corrige à la voix
   (« non, ça c'est un autre code », « pour corset-minerve, c'est le code 2754230 ») ou dans la fenêtre. Les corrections vivent SUR L'APPAREIL (localStorage « rayle_lppr_vocab ») et sont aussi
   exportables en JSON pour être rapportées dans vocabulaire.json. Rien n'est envoyé à un serveur.
   Structure : { ajouts: { idTerme: [codes à mettre en tête] }, exclusions: { idTerme: [codes à ne plus proposer] }, synonymes: { idTerme: ['mot officiel supplémentaire'] }, termes: [ { id, mots, officiel, familles } ] } */
export const corrections_vide = () => ({ version: 1, ajouts: {}, exclusions: {}, synonymes: {}, termes: [], historique: [] });
const ajouterUnique = (obj, cle, val) => { const l = obj[cle] || (obj[cle] = []); if (!l.includes(val)) l.push(val); };
const retirer = (obj, cle, val) => { if (obj[cle]) obj[cle] = obj[cle].filter(x => x !== val); };
export const idPourMot = (vocabulaire, mot) => {
  const m = sansPonctuation(mot); if (!m) return null;
  for (const t of (vocabulaire && vocabulaire.termes) || []) if (t.mots.some(x => sansPonctuation(x) === m)) return t.id;
  for (const t of (vocabulaire && vocabulaire.termes) || []) if (t.mots.some(x => (' ' + m + ' ').includes(' ' + sansPonctuation(x) + ' '))) return t.id;
  return null;
};
/* « pour <terme>, c'est le code <code> » : le code passe en tête de ce que Raylé propose pour ce terme. Rend la nouvelle structure (sans toucher à l'ancienne). */
export function corrigerCode(corr, vocabulaire, terme, code, { maintenant = Date.now() } = {}) {
  const c = JSON.parse(JSON.stringify(corr || corrections_vide())), id = idPourMot(vocabulaire, terme) || ('perso-' + sansPonctuation(terme).replace(/ /g, '-'));
  if (!/^\d{7}$/.test(String(code))) return { ok: false, raison: 'Un code LPPR a 7 chiffres.' };
  if (id.startsWith('perso-') && !c.termes.some(t => t.id === id)) c.termes.push({ id, mots: [terme], officiel: [], familles: [], incertain: true, note: 'Terme ajouté par Justin.' });
  ajouterUnique(c.ajouts, id, String(code)); retirer(c.exclusions, id, String(code)); c.historique.push({ t: maintenant, action: 'ajout', terme, id, code: String(code) });
  return { ok: true, corrections: c, id };
}
/* « non, ça c'est un autre code » : le code n'est plus proposé pour ce terme. */
export function exclureCode(corr, vocabulaire, terme, code, { maintenant = Date.now() } = {}) {
  const c = JSON.parse(JSON.stringify(corr || corrections_vide())), id = idPourMot(vocabulaire, terme); if (!id) return { ok: false, raison: 'Je ne connais pas le terme « ' + terme + ' » : dis d’abord ce que c’est (« pour ' + terme + ', c’est le code … »).' };
  ajouterUnique(c.exclusions, id, String(code)); retirer(c.ajouts, id, String(code)); c.historique.push({ t: maintenant, action: 'exclusion', terme, id, code: String(code) });
  return { ok: true, corrections: c, id };
}
export function ajouterSynonyme(corr, vocabulaire, terme, motOfficiel, { maintenant = Date.now() } = {}) {
  const c = JSON.parse(JSON.stringify(corr || corrections_vide())), id = idPourMot(vocabulaire, terme); if (!id) return { ok: false, raison: 'Terme inconnu : « ' + terme + ' ».' };
  ajouterUnique(c.synonymes, id, String(motOfficiel)); c.historique.push({ t: maintenant, action: 'synonyme', terme, id, mot: motOfficiel });
  return { ok: true, corrections: c, id };
}
/* Vocabulaire effectif = départ + termes ajoutés par Justin. */
export function vocabulaireEffectif(vocabulaire, corr) {
  const base = vocabulaire || { termes: [] }; if (!corr || !corr.termes || !corr.termes.length) return base;
  return { ...base, termes: [...base.termes, ...corr.termes] };
}
const CLE = 'rayle_lppr_vocab';
export function lireCorrections(stockage = (typeof localStorage !== 'undefined' ? localStorage : null)) { try { const j = stockage && JSON.parse(stockage.getItem(CLE) || 'null'); return j && j.version ? { ...corrections_vide(), ...j } : corrections_vide(); } catch (e) { return corrections_vide(); } }
export function ecrireCorrections(corr, stockage = (typeof localStorage !== 'undefined' ? localStorage : null)) { try { stockage && stockage.setItem(CLE, JSON.stringify(corr)); return true; } catch (e) { return false; } }
