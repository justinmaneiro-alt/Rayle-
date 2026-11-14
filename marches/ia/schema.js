/* ═════════════ ANALYSE IA : format JSON attendu et VALIDATION STRICTE (pur, sans réseau) ═════════════
   Même validation pour la réponse collée à la main et pour celle d'un fournisseur automatique. Scénarios conditionnels seulement : une réponse qui contient une probabilité chiffrée
   ou une taille de position est REJETÉE (pas corrigée). Le texte d'avertissement est imposé par notre code, jamais celui de l'IA. */
export const AVERTISSEMENT = 'Aide à la lecture, peut se tromper, ne pas utiliser comme signal.';
export const LIMITES = { resume: 700, nom: 80, texte: 300, zones: 8, niveaux: 10, scenarios: 4, chemin: 6, invalidations: 6, themes: 8 };

const RE_PROBA = /(probabilit|\bchances?\b|\bproba\b|\b\d{1,3}\s*%\s*(de\s+)?(chance|probab|prob\b))|(\b\d{1,3}\s*%\s*(que|qu'|de réussite|de succès))|\b(sur|in)\s+\d+\s+(chance|odds)|\bodds\b|\blikelihood\b/i;
const RE_TAILLE = /(taille de position|position size|\b\d+([.,]\d+)?\s*(lots?|contrats?|unités|units)\b|\brisque[rz]?\s+\d+([.,]\d+)?\s*%|\b\d+([.,]\d+)?\s*%\s*(du|de mon|de votre)\s*(capital|compte)|levier\s*x?\s*\d+|stop[- ]?loss de \d+ lots?)/i;
export const interdit = t => RE_PROBA.test(t) ? 'probabilité chiffrée interdite' : RE_TAILLE.test(t) ? 'taille de position interdite' : null;

const nb = v => typeof v === 'number' && isFinite(v);
const txt = (v, max, nom) => { if (typeof v !== 'string' || !v.trim()) throw new Error(nom + ' : texte manquant'); if (v.length > max) throw new Error(nom + ' : trop long (' + v.length + ' > ' + max + ')'); const i = interdit(v); if (i) throw new Error(nom + ' : ' + i); return v.trim(); };

/* Extrait le premier objet JSON d'un texte (clôtures ```json, texte autour) ; lève une erreur claire sinon */
export function extraireJson(brut) {
  let s = String(brut == null ? '' : brut).trim(); if (!s) throw new Error('réponse vide');
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const i = s.indexOf('{'); if (i < 0) throw new Error('aucun objet JSON trouvé dans la réponse');
  let prof = 0, dansChaine = false, esc = false;
  for (let k = i; k < s.length; k++) {
    const c = s[k]; if (dansChaine) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') dansChaine = false; continue; }
    if (c === '"') dansChaine = true; else if (c === '{') prof++; else if (c === '}' && --prof === 0) { try { return JSON.parse(s.slice(i, k + 1)); } catch (e) { throw new Error('JSON invalide : ' + e.message.slice(0, 80)); } }
  }
  throw new Error('JSON incomplet (accolade non fermée)');
}

/* Valide une analyse de graphique. `plage` = { min, max } des prix du graphique : un prix hors de [min − 1 amplitude, max + 1 amplitude] est rejeté (prix absurde). */
export function validerAnalyse(obj, { plage = null } = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('la réponse doit être un objet JSON');
  const type = obj.type || 'graphique'; if (type !== 'graphique') throw new Error('type attendu « graphique », reçu « ' + type + ' »');
  const marge = plage ? (plage.max - plage.min) * 1.0 + 1e-9 : null, prix = (v, nom) => { if (!nb(v)) throw new Error(nom + ' : prix numérique attendu'); if (plage && (v < plage.min - marge || v > plage.max + marge)) throw new Error(nom + ' : prix ' + v + ' hors du graphique (' + plage.min + ' à ' + plage.max + ')'); return v; };
  const liste = (cle, max, f) => { const a = obj[cle] == null ? [] : obj[cle]; if (!Array.isArray(a)) throw new Error(cle + ' : liste attendue'); if (a.length > max) throw new Error(cle + ' : au plus ' + max + ' éléments'); return a.map((x, i) => { if (!x || typeof x !== 'object') throw new Error(cle + '[' + i + '] : objet attendu'); try { return f(x); } catch (e) { throw new Error(cle + '[' + i + '] ' + e.message); } }); };
  const roles = new Set(['support', 'resistance', 'autre']);
  const out = {
    type: 'graphique', resume: txt(obj.resume, LIMITES.resume, 'resume'),
    zones: liste('zones', LIMITES.zones, z => { const bas = prix(z.bas, 'bas'), haut = prix(z.haut, 'haut'); if (bas > haut) throw new Error(': bas > haut'); return { nom: txt(z.nom, LIMITES.nom, 'nom'), bas, haut, role: roles.has(z.role) ? z.role : 'autre' }; }),
    niveaux: liste('niveaux', LIMITES.niveaux, n => ({ nom: txt(n.nom, LIMITES.nom, 'nom'), prix: prix(n.prix, 'prix'), role: roles.has(n.role) ? n.role : 'autre' })),
    scenarios: liste('scenarios', LIMITES.scenarios, s => {
      const condition = txt(s.condition, LIMITES.texte, 'condition'); if (!/^\s*(si|if|tant que|à condition|sous réserve|après|une fois|lorsque|quand)\b/i.test(condition)) throw new Error(': la condition doit être conditionnelle (« Si … »)');
      const dir = ['haussier', 'baissier', 'neutre'].includes(s.direction) ? s.direction : 'neutre';
      const chemin = s.chemin == null ? [] : s.chemin; if (!Array.isArray(chemin) || chemin.length > LIMITES.chemin) throw new Error(': chemin = liste de ' + LIMITES.chemin + ' prix au plus');
      return { nom: txt(s.nom, LIMITES.nom, 'nom'), condition, direction: dir, cible: s.cible == null ? null : prix(s.cible, 'cible'), invalidation: s.invalidation == null ? null : prix(s.invalidation, 'invalidation'), chemin: chemin.map((p, k) => prix(p, 'chemin[' + k + ']')) };
    }),
    invalidations: liste('invalidations', LIMITES.invalidations, x => ({ prix: prix(x.prix, 'prix'), texte: txt(x.texte, LIMITES.texte, 'texte') })),
    avertissement: AVERTISSEMENT
  };
  if (!out.zones.length && !out.niveaux.length && !out.scenarios.length) throw new Error('aucune zone, aucun niveau et aucun scénario : analyse vide');
  return out;
}

/* Analyse d'actualité (« Comprendre l'actualité ») : thèmes expliqués, aucun prix, aucune prévision chiffrée */
export function validerActualite(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('la réponse doit être un objet JSON'); if ((obj.type || 'actualite') !== 'actualite') throw new Error('type attendu « actualite »');
  const t = Array.isArray(obj.themes) ? obj.themes : null; if (!t || !t.length) throw new Error('themes : liste non vide attendue'); if (t.length > LIMITES.themes) throw new Error('themes : au plus ' + LIMITES.themes);
  return { type: 'actualite', resume: txt(obj.resume, LIMITES.resume, 'resume'), themes: t.map((x, i) => { try { return { titre: txt(x.titre, LIMITES.nom, 'titre'), explication: txt(x.explication, 500, 'explication'), actifs: (Array.isArray(x.actifs) ? x.actifs : []).filter(a => ['or', 'us100', 'btc', 'usd', 'chf'].includes(a)) }; } catch (e) { throw new Error('themes[' + i + '] ' + e.message); } }), avertissement: AVERTISSEMENT };
}
export function valider(type, brut, opts) { const o = typeof brut === 'string' ? extraireJson(brut) : brut; return type === 'actualite' ? validerActualite(o) : validerAnalyse(o, opts); }

/* Format demandé à l'IA (inclus dans le texte exporté) */
export const FORMAT_GRAPHIQUE = `{
  "type": "graphique",
  "resume": "2 à 4 phrases : lecture du contexte, sans prévision chiffrée",
  "zones": [ { "nom": "Résistance 3 880-3 895", "bas": 3880, "haut": 3895, "role": "resistance" } ],
  "niveaux": [ { "nom": "MA200", "prix": 3862.5, "role": "support" } ],
  "scenarios": [ { "nom": "Reprise", "condition": "Si le prix clôture au-dessus de 3 895", "direction": "haussier", "cible": 3930, "invalidation": 3870, "chemin": [3890, 3910, 3930] } ],
  "invalidations": [ { "prix": 3850, "texte": "Une clôture sous 3 850 annule la lecture haussière" } ]
}`;
export const FORMAT_ACTUALITE = `{
  "type": "actualite",
  "resume": "2 à 4 phrases",
  "themes": [ { "titre": "Taux et Fed", "explication": "ce que disent les titres, en 1 à 3 phrases", "actifs": ["or", "usd"] } ]
}`;
