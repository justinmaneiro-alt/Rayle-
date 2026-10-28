import { CATALOGUE, STOPS, LIMITES, validerRegle, signauxDepuisRegle, cleRegle, decrireRegle, decrireCondition } from '../../planetes/mars/pc/agent-btc/regles-lab.js';
import { FAMILLES } from '../../planetes/mars/pc/agent-btc/hypotheses.js';

/* ═════════════ LE CHERCHEUR (V4, phase 6 ; module pur, testé : galaxie/tests/equipe-test.mjs) ═════════════
   Un des trois rôles internes de Kepler. Il LIT (entonnoir de rejet, résultats par famille, journal des occasions manquées, carte de liquidité, exemples de Justin) et ÉCRIT au plus 10 hypothèses par jour,
   en JSON structuré : { titre, raison, contexte[], declencheur[], cote, stop, cible: { R } }. Un VALIDATEUR DE SCHÉMA rejette tout ce qui est flou, hors catalogue, hors bornes, qui invente un niveau de
   prix ou dont la raison économique est absente. Le code transforme ensuite chaque hypothèse acceptée en STRATÉGIE TESTABLE (une petite famille, ≤ 81 variantes autour d'elle) qui passe EXACTEMENT les
   mêmes critères que les autres. Le Chercheur n'a JAMAIS le droit de valider ; le modèle de langage (Dolphin local, ou API gratuite) ne fait que proposer : il ne calcule rien. */
export const LIMITES_CHERCHEUR = Object.freeze({ parJour: 10, titreMax: 80, raisonMin: 70, conditionsMax: LIMITES.conditionsMax, variantesMax: 81 });
const DECLENCHEURS = new Set(['cassure', 'croisement', 'balayage', 'meche', 'rsi', 'zone', 'absorption', 'divergence_cvd', 'balayage_liquidite']);
export const EST_DECLENCHEUR = type => DECLENCHEURS.has(type);
const CONNECTEURS = /\b(car|parce que|puisque|donc|ce qui|alors que|afin de|pour que|du coup|en effet)\b/i;
const MOTS_ECONOMIQUES = /\b(stops?|ordres?|liquidit[ée]|acheteurs?|vendeurs?|agress\w*|absor\w*|piscine|teneurs?|perd\w*|gagn\w*|flux|carnet|volume|contrepartie)\b/i;

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
export const idHypothese = regle => 'hyp_' + hash(cleRegle(regle));

/* Cherche récursivement un « niveau de prix » inventé (clé prix / niveau / price / level avec un nombre). */
const aPrixInvente = (x, profondeur = 0) => { if (profondeur > 6 || !x || typeof x !== 'object') return false; for (const [k, v] of Object.entries(x)) { if (/^(prix|niveau|price|level|cours)$/i.test(k) && typeof v === 'number') return true; if (aPrixInvente(v, profondeur + 1)) return true; } return false; };

/* Valide une hypothèse brute. Rend { ok, erreurs[], regle, id }. */
export function validerHypothese(h) {
  const erreurs = [];
  if (!h || typeof h !== 'object' || Array.isArray(h)) return { ok: false, erreurs: ['hypothèse absente ou mal formée'], regle: null, id: null };
  const titre = String(h.titre || '').trim(), raison = String(h.raison || '').trim();
  if (titre.length < 8 || titre.length > LIMITES_CHERCHEUR.titreMax) erreurs.push('titre absent ou trop court / trop long (8 à ' + LIMITES_CHERCHEUR.titreMax + ' caractères)');
  if (raison.length < LIMITES_CHERCHEUR.raisonMin || !CONNECTEURS.test(raison) || !MOTS_ECONOMIQUES.test(raison)) erreurs.push('raison économique absente ou floue (au moins ' + LIMITES_CHERCHEUR.raisonMin + ' caractères, un « car / parce que… » et qui perd ou pourquoi ça gagne)');
  if (aPrixInvente(h)) erreurs.push('niveau de prix inventé : les niveaux viennent du moteur de liquidité, jamais du modèle');
  const ctxs = Array.isArray(h.contexte) ? h.contexte : h.contexte == null ? [] : null, decl = Array.isArray(h.declencheur) ? h.declencheur : null;
  if (ctxs == null) erreurs.push('contexte : une liste de conditions (peut être vide)');
  if (!decl || !decl.length) erreurs.push('déclencheur : au moins une condition d’événement');
  else if (!decl.some(c => c && DECLENCHEURS.has(c.type))) erreurs.push('déclencheur : doit contenir un événement (' + [...DECLENCHEURS].join(', ') + ')');
  if (ctxs && decl && ctxs.length + decl.length > LIMITES_CHERCHEUR.conditionsMax) erreurs.push('trop de conditions (maximum ' + LIMITES_CHERCHEUR.conditionsMax + ')');
  if (!h.cible || typeof h.cible.R !== 'number') erreurs.push('cible : { R: nombre } attendu');
  if (erreurs.length) return { ok: false, erreurs, regle: null, id: null };
  const v = validerRegle({ nom: titre, cote: h.cote, conditions: [...ctxs, ...decl], stop: h.stop, R: h.cible.R });
  if (!v.ok) return { ok: false, erreurs: v.erreurs, regle: null, id: null };
  return { ok: true, erreurs: [], regle: v.regle, id: idHypothese(v.regle), titre, raison };
}

/* ── Une hypothèse devient une petite FAMILLE testable : la règle + ses voisins immédiats (≤ 81 variantes) ── */
const ECHELLE = { N: [12, 24, 36, 48, 72, 96, 144, 192, 240, 300], periode: [5, 8, 10, 14, 20, 30, 50, 100, 200], L: [8, 12, 16, 24, 32, 48, 64, 96], fenetre: [12, 24, 36, 48, 72, 96, 120] };
const PAS = { min: 0.25, max: 0.1, ratioMin: 0.05, seuil: 5, meche: 0.1, ratio: 0.1, distance: 0.25, k: 0.5, pad: 0.1, R: 1, facteur: 0.5, minTouches: 1 };
const valeursAutour = (champ, v) => {
  const e = ECHELLE[champ]; if (e) { const i = e.indexOf(v); if (i >= 0) return [...new Set([e[Math.max(0, i - 1)], v, e[Math.min(e.length - 1, i + 1)]])]; }
  const p = PAS[champ]; if (!p) return [v]; return [...new Set([+(v - p).toFixed(4), v, +(v + p).toFixed(4)])].filter(x => x > 0);
};
export function ajustables(regle) {
  const out = [{ cle: 'R', valeur: regle.R, champ: 'R' }], sf = regle.stop.type === 'atr' ? 'k' : 'pad'; out.push({ cle: 'stop.' + sf, valeur: regle.stop[sf], champ: sf });
  const cands = []; regle.conditions.forEach((c, ci) => { for (const [k, v] of Object.entries(c)) if (k !== 'type' && typeof v === 'number' && PAS[k] != null || (k !== 'type' && typeof v === 'number' && ECHELLE[k])) cands.push({ cle: 'c' + ci + '.' + k, valeur: v, champ: k, declencheur: DECLENCHEURS.has(c.type) }); });
  cands.sort((a, b) => (b.declencheur ? 1 : 0) - (a.declencheur ? 1 : 0)); for (const c of cands.slice(0, 2)) out.push(c);
  return out;
}
export function regleDepuisParams(base, p) {
  const r = JSON.parse(JSON.stringify(base)); for (const [cle, val] of Object.entries(p)) { if (cle === 'R') r.R = val; else if (cle.startsWith('stop.')) r.stop[cle.slice(5)] = val; else { const m = /^c(\d+)\.(.+)$/.exec(cle); if (m && r.conditions[+m[1]]) r.conditions[+m[1]][m[2]] = val; } } return r;
}
export function familleDepuisHypothese({ id, titre, raison, regle }) {
  const aj = ajustables(regle), memo = new Map();
  const grille = () => Object.fromEntries(aj.map(a => [a.cle, valeursAutour(a.champ, a.valeur)]));
  return { id, nom: titre, description: decrireRegle(regle), hypothese: raison, origine: 'chercheur', regle, grille,
    signaux(ctx, p) { const k = JSON.stringify(p); let r = memo.get(k); if (r === undefined) { const v = validerRegle(regleDepuisParams(regle, p)); r = v.ok ? v.regle : null; memo.set(k, r); } return r ? signauxDepuisRegle(ctx, r) : { sens: new Int8Array(ctx.n), stop: new Float64Array(ctx.n), R: regle.R }; } };
}
export function enregistrerHypothese(h) { const f = familleDepuisHypothese(h); FAMILLES[h.id] = f; return f; }
export const tailleGrilleHypothese = h => Object.values(familleDepuisHypothese(h).grille()).reduce((a, v) => a * v.length, 1);

/* ── Lecture de la sortie d'un modèle de langage : tolère des balises ```json et un texte autour ── */
export function parserSortieModele(texte) {
  if (typeof texte !== 'string') return { ok: false, hypotheses: [], erreur: 'sortie vide' };
  let t = texte.replace(/```(?:json)?/gi, '').trim(); const a = Math.min(...['[', '{'].map(c => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
  if (!Number.isFinite(a)) return { ok: false, hypotheses: [], erreur: 'aucun JSON dans la réponse' };
  const ouvre = t[a], ferme = ouvre === '[' ? ']' : '}', b = t.lastIndexOf(ferme); if (b < a) return { ok: false, hypotheses: [], erreur: 'JSON incomplet' };
  try { const j = JSON.parse(t.slice(a, b + 1)); const liste = Array.isArray(j) ? j : Array.isArray(j.hypotheses) ? j.hypotheses : [j]; return { ok: true, hypotheses: liste }; } catch (e) { return { ok: false, hypotheses: [], erreur: 'JSON illisible : ' + String(e.message).slice(0, 80) }; }
}
/* Filtre une liste brute : validée, non déjà vue, au plus `max` (le budget restant du jour). Rend { acceptees: [{ id, titre, raison, regle }], rejetees: [{ titre, raisons }] }. */
export function filtrerHypotheses(liste, { dejaVues = new Set(), max = LIMITES_CHERCHEUR.parJour } = {}) {
  const acceptees = [], rejetees = [], vus = new Set(dejaVues);
  for (const h of Array.isArray(liste) ? liste : []) {
    if (acceptees.length >= max) { rejetees.push({ titre: String(h && h.titre || '?').slice(0, 60), raisons: ['budget du jour atteint'] }); continue; }
    const v = validerHypothese(h); if (!v.ok) { rejetees.push({ titre: String(h && h.titre || '?').slice(0, 60), raisons: v.erreurs }); continue; }
    if (vus.has(v.id)) { rejetees.push({ titre: v.titre, raisons: ['déjà proposée ou déjà testée'] }); continue; }
    if (tailleGrilleHypothese(v) > LIMITES_CHERCHEUR.variantesMax) { rejetees.push({ titre: v.titre, raisons: ['trop de variantes'] }); continue; }
    vus.add(v.id); acceptees.push({ id: v.id, titre: v.titre, raison: v.raison, regle: v.regle });
  }
  return { acceptees, rejetees };
}

/* ── Prompt du Chercheur (Dolphin / modèle local ou API) : français, direct, ne calcule rien, n'invente aucun chiffre ni niveau, aucun ordre ── */
export function promptSystemeChercheur() {
  return [
    'Tu es le Chercheur de Kepler, un agent de recherche en trading. Tu parles français, tu es direct et concis.',
    'Ton seul travail : proposer au plus ' + LIMITES_CHERCHEUR.parJour + ' HYPOTHÈSES de stratégie, en JSON, à partir des faits que je te donne. Tu ne valides rien, tu ne calcules rien.',
    'INTERDIT : inventer un chiffre, un résultat, un niveau de prix (les niveaux viennent du moteur de liquidité) ; promettre un gain ; donner un ordre ; écrire autre chose que du JSON.',
    'Chaque hypothèse DOIT avoir une raison économique : qui perd de l’argent, et pourquoi cette stratégie peut gagner à sa place (avec un « car » ou un « parce que »).',
    'Format de sortie : un tableau JSON [ { "titre": "...", "raison": "...", "contexte": [conditions d’état], "declencheur": [au moins une condition d’événement], "cote": "long" | "short" | "les-deux", "stop": { "type": "atr", "tf": "h1", "k": 1.5 } ou { "type": "structure", "L": 24, "pad": 0.3 }, "cible": { "R": 2 } } ].',
    'Les conditions viennent UNIQUEMENT du catalogue fourni, avec ses champs et ses bornes. Au plus ' + LIMITES_CHERCHEUR.conditionsMax + ' conditions par hypothèse. Réponds seulement avec le JSON.'
  ].join('\n');
}
export function catalogueResume() {
  return Object.entries(CATALOGUE).map(([type, d]) => ({ type, role: DECLENCHEURS.has(type) ? 'declencheur' : 'contexte', nom: d.nom, champs: d.champs })).concat([{ type: 'stop', stops: STOPS }]);
}
export function promptUtilisateurChercheur(faits) {
  return 'FAITS (calculés par le code, ne les modifie pas) :\n' + JSON.stringify(faits) + '\n\nCATALOGUE DES CONDITIONS :\n' + JSON.stringify(catalogueResume()) + '\n\nPropose tes hypothèses (JSON seulement).';
}
/* Faits compacts donnés au modèle : entonnoir, meilleures familles, occasions manquées, carte de liquidité (résumé), exemples de Justin. Rien n'est inventé : champs absents = null. */
export function construireFaitsChercheur({ entonnoir = null, parFamille = null, occasions = null, aimants = null, exemples = null, dejaTestees = 0, diagnosticVerdict = null } = {}) {
  return {
    verdict_du_diagnostic: diagnosticVerdict, hypotheses_deja_testees: dejaTestees,
    verrous_les_plus_frequents: entonnoir ? entonnoir.criteres.slice(0, 6).map(c => ({ critere: c.critere, part_des_echecs: Math.round(c.part * 100) + ' %' })) : null,
    meilleures_familles: parFamille ? parFamille.liste.slice(0, 5).map(f => ({ famille: f.nom, actif: f.paire, esperance_R: +f.esperance.toFixed(2), trades: f.trades })) : null,
    occasions_manquees: occasions ? { total: occasions.total, resume: occasions.resume } : null,
    carte_de_liquidite: aimants ? aimants.slice(0, 3) : null,
    exemples_de_justin: exemples ? { total: exemples.total, expliques: exemples.expliques, contextes: exemples.contextes } : null
  };
}

/* ── Chercheur SANS modèle (secours, déterministe) : assemble des hypothèses à partir de « briques » économiques connues, orientées par les faits (occasions manquées et exemples de Justin : contextes les plus
   fréquents ; sinon familles de flux). Aucune valeur inventée : tous les nombres viennent des grilles du catalogue. ── */
const BRIQUES = {
  absorption: { cond: { type: 'absorption', facteur: 2.5 }, pourquoi: 'des ordres limites encaissent une agression massive sans reculer, ce qui épuise les agresseurs' },
  divergence_cvd: { cond: { type: 'divergence_cvd', fenetre: 48 }, pourquoi: 'le mouvement n’est pas porté par un vrai flux d’agresseurs' },
  balayage_liquidite: { cond: { type: 'balayage_liquidite', minTouches: 2 }, pourquoi: 'les stops au-delà d’un extrême évident sont consommés, donc il ne reste plus de carburant' },
  flux_persistant: { cond: { type: 'flux_persistant', k: 4, seuil: 0.08 }, pourquoi: 'un flux agressif de même sens persiste, ce qui est de la demande réelle' }
};
const CONTEXTES_SECOURS = [
  { cond: { type: 'phase', tf: 'h1', valeurs: ['tendance'] }, nom: 'en tendance H1', cote: 'long', pourquoi: 'ceux qui jouent contre la tendance sont les perdants habituels' },
  { cond: { type: 'phase', tf: 'h1', valeurs: ['range'] }, nom: 'en range H1', cote: 'les-deux', pourquoi: 'ceux qui poursuivent les cassures dans un range sont piégés' },
  { cond: { type: 'volume', min: 1.5 }, nom: 'avec du volume', cote: 'les-deux', pourquoi: 'le volume confirme que le niveau est réellement échangé' },
  { cond: { type: 'session', valeurs: [2] }, nom: 'pendant New York', cote: 'les-deux', pourquoi: 'la liquidité et l’agressivité sont à leur maximum à cette heure' },
  { cond: { type: 'zone', nom: 'veille_bas', distance: 0.5 }, nom: 'près du bas de la veille', cote: 'long', pourquoi: 'les stops des vendeurs à découvert s’accumulent sous le bas de la veille' },
  { cond: { type: 'zone', nom: 'veille_haut', distance: 0.5 }, nom: 'près du haut de la veille', cote: 'short', pourquoi: 'les stops des acheteurs s’accumulent au-dessus du haut de la veille' }
];
export function proposerSansModele({ occasions = null, exemples = null, dejaVues = new Set(), max = LIMITES_CHERCHEUR.parJour } = {}) {
  const ordre = Object.keys(BRIQUES), prefs = {}; for (const src of [occasions && occasions.contextes, exemples && exemples.contextes]) for (const [k, n] of Object.entries(src || {})) if (BRIQUES[k]) prefs[k] = (prefs[k] || 0) + n;
  ordre.sort((a, b) => (prefs[b] || 0) - (prefs[a] || 0) || ordre.indexOf(a) - ordre.indexOf(b));                       // d'abord les briques les plus présentes dans les occasions et les exemples
  const out = [];
  for (const k of ordre) for (const ctx of CONTEXTES_SECOURS) {
    const cote = ctx.cote === 'les-deux' ? 'les-deux' : ctx.cote, b = BRIQUES[k];
    out.push({ titre: ('Flux ' + k.replace(/_/g, ' ') + ' ' + ctx.nom).slice(0, LIMITES_CHERCHEUR.titreMax), raison: 'On entre sur ' + k.replace(/_/g, ' ') + ' ' + ctx.nom + ' car ' + b.pourquoi + ' ; qui perd : ' + ctx.pourquoi + ', et le stop est petit et connu.', contexte: [ctx.cond], declencheur: [b.cond], cote, stop: { type: 'structure', L: 24, pad: 0.3 }, cible: { R: 2 } });
  }
  return filtrerHypotheses(out, { dejaVues, max });
}
export { decrireRegle, decrireCondition, cleRegle };
