/* ═════════════ FRAÎCHEUR DES DONNÉES (v6, B2) — état des sources, voyant global, pastilles « périmé » ═════════════
   Règle unique pour toute l'appli : une donnée est
     · à jour  (vert)   tant que son âge ≤ 2 × son délai normal ;
     · périmée (orange) au-delà de 2 × le délai normal ;
     · en panne (rouge) au-delà de 5 × le délai normal.
   Le délai normal est celui de la tâche qui la publie (branche `donnees` : lot rapide toutes les 5 min, bougies toutes les 15 min, horaire toutes les heures, etc.). Module pur + une lecture réseau injectable. */
export const MIN = 60e3, H = 3600e3, J = 86400e3;
export const BASE = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/';
/* familles de fichiers de la branche « donnees » → délai normal (ms) ; `essentiel` : compte dans le voyant global */
export const FAMILLES = Object.freeze([
  { id: 'bougies', nom: 'Bougies Yahoo (5 m, 15 m, H1, Daily)', re: /^bougies-/, delai: 15 * MIN, essentiel: true },
  { id: 'analyse', nom: 'Analyse H4 / Jour (pro-*)', re: /^pro-/, delai: 30 * MIN, essentiel: true },
  { id: 'jours', nom: 'Séries journalières (jour-*)', re: /^jour-/, delai: 1 * J, essentiel: false },
  { id: 'marches', nom: 'Fenêtre Marchés (marches-*)', re: /^marches-(?!calendrier|cot)/, delai: 30 * MIN, essentiel: true },
  { id: 'calendrier', nom: 'Calendrier économique', re: /^(calendrier2|marches-calendrier)/, delai: 6 * H, essentiel: false },
  { id: 'cot', nom: 'COT (positions des fonds)', re: /^(cot-|marches-cot)/, delai: 8 * J, essentiel: false },
  { id: 'actus', nom: 'Actualités', re: /^actus-/, delai: 30 * MIN, essentiel: false },
  { id: 'sante', nom: 'Santé du marché (taux réels, Fed)', re: /^(sante|yahoo-2y|gld)/, delai: 1 * H, essentiel: false },
  { id: 'institutions', nom: 'Banques et institutions', re: /^(banques|institutions)/, delai: 1 * J, essentiel: false }
]);
export const familleDe = fichier => FAMILLES.find(f => f.re.test(fichier)) || null;

export function statut(t, delai, maintenant = Date.now()) {
  if (!Number.isFinite(t) || !(delai > 0)) return { code: 'inconnu', age: null, ratio: null };
  const age = Math.max(0, maintenant - t), ratio = age / delai; return { code: ratio > 5 ? 'rouge' : ratio > 2 ? 'orange' : 'vert', age, ratio };
}
/* classe CSS de la pastille d'un chiffre : '' (rien), 'orange' ou 'rouge' ; `delai` null = on ne sait pas : jamais de fausse alerte */
export const classePeremption = (t, delai, maintenant = Date.now()) => { if (!delai) return ''; const s = statut(t, delai, maintenant); return s.code === 'orange' || s.code === 'rouge' ? s.code : ''; };
/* délai normal déduit de l'étiquette de source affichée à côté d'un chiffre (« Yahoo Finance (robot GitHub, différé) », « Kraken (direct) »…) */
export function delaiPourSource(source) {
  const s = String(source || '');
  if (/direct|temps réel|WebSocket|Kraken|Binance/i.test(s)) return 5 * MIN;
  if (/robot|instantané|Yahoo|GitHub|différé/i.test(s)) return 30 * MIN;
  if (/COT/i.test(s)) return 8 * J; if (/calendrier/i.test(s)) return 6 * H; if (/Trésor|taux réels|Fed/i.test(s)) return 1 * J;
  return null;
}
/* liste d'état à partir des index publiés : donnees/index.json { fichiers: { nom: { t, ok } } }, footprint/index.json { t }, historique/index.json { t }, controle/controle-nuit.json { t } */
export function construireEtat({ donnees, footprint, historique, controle } = {}, maintenant = Date.now()) {
  const L = [], groupes = new Map();
  for (const [nom, e] of Object.entries((donnees && donnees.fichiers) || {})) { const f = familleDe(nom); if (!f) continue; let g = groupes.get(f.id); if (!g) { g = { famille: f, t: Infinity, n: 0, ko: 0, nomsKo: [] }; groupes.set(f.id, g); } g.n++; g.t = Math.min(g.t, e.t || 0); if (e.ok === false) { g.ko++; g.nomsKo.push(nom); } }
  for (const g of groupes.values()) { const s = statut(g.t, g.famille.delai, maintenant); L.push({ id: g.famille.id, nom: g.famille.nom, essentiel: g.famille.essentiel, t: g.t, delai: g.famille.delai, prochaine: g.t + g.famille.delai, statut: g.ko ? (s.code === 'vert' ? 'orange' : s.code) : s.code, fichiers: g.n, echecs: g.ko, detail: g.ko ? g.nomsKo.slice(0, 4).join(', ') : null }); }
  const add = (id, nom, t, delai, essentiel = false) => { if (!Number.isFinite(t)) { L.push({ id, nom, essentiel, t: null, delai, prochaine: null, statut: 'rouge', fichiers: 0, echecs: 0, detail: 'index illisible ou absent' }); return; } L.push({ id, nom, essentiel, t, delai, prochaine: t + delai, statut: statut(t, delai, maintenant).code, fichiers: null, echecs: 0, detail: null }); };
  add('historique', 'Historique long (branche historique)', historique && historique.t, 8 * J); add('footprint', 'Footprint (branche footprint)', footprint && footprint.t, 2 * J);
  if (controle) add('controle', 'Contrôles de la nuit', controle.t, 2 * J);
  const ordre = { rouge: 0, orange: 1, inconnu: 2, vert: 3 }; return L.sort((a, b) => ordre[a.statut] - ordre[b.statut] || a.nom.localeCompare(b.nom, 'fr'));
}
/* voyant global : rouge si une source essentielle est en panne ou si plus de la moitié des sources sont périmées ; orange si une source essentielle est périmée ou si une autre est en panne */
export function voyant(L) {
  if (!L || !L.length) return 'rouge'; const ess = L.filter(x => x.essentiel);
  if (ess.some(x => x.statut === 'rouge') || L.filter(x => x.statut !== 'vert').length > L.length / 2) return 'rouge';
  if (ess.some(x => x.statut === 'orange') || L.some(x => x.statut === 'rouge' || x.statut === 'orange')) return 'orange'; return 'vert';
}
const dureeFr = ms => { const m = Math.round(ms / MIN); return m < 1 ? 'à l’instant' : m < 60 ? m + ' min' : m < 2880 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' j'; };
export const age = (t, maintenant = Date.now()) => (Number.isFinite(t) ? dureeFr(Math.max(0, maintenant - t)) : 'inconnu');
/* « Rayle, est-ce que mes données sont à jour ? » : une réponse courte, honnête, parlée */
export function phraseDonnees(L, maintenant = Date.now()) {
  if (!L || !L.length) return 'Je ne peux pas lire l’état de mes sources pour le moment : je ne peux donc pas te dire si les données sont à jour.';
  const v = voyant(L), pb = L.filter(x => x.statut === 'rouge' || x.statut === 'orange');
  if (v === 'vert') return `Oui, tout est à jour : ${L.length} sources vérifiées, la plus ancienne a ${age(Math.min(...L.map(x => x.t).filter(Number.isFinite)), maintenant)}.`;
  const noms = pb.slice(0, 3).map(x => `${x.nom.replace(/ \(.*\)/, '')} (${x.statut === 'rouge' ? 'en panne' : 'en retard'}, ${age(x.t, maintenant)})`).join(', ');
  return (v === 'rouge' ? 'Non, pas tout : ' : 'En grande partie, mais ') + `${pb.length} source${pb.length > 1 ? 's' : ''} ${pb.length > 1 ? 'sont' : 'est'} en retard : ${noms}.`;
}
/* erreurs de lecture notées sur CET appareil, sur 24 h (pas de serveur pour les compter ailleurs) */
export const CLE_ERREURS = 'rayle_etat_erreurs_v1';
export function noterErreur(source, st = (typeof localStorage !== 'undefined' ? localStorage : null), maintenant = Date.now()) { try { const L = JSON.parse(st.getItem(CLE_ERREURS) || '[]').filter(e => maintenant - e.t < J); L.push({ s: String(source).slice(0, 40), t: maintenant }); st.setItem(CLE_ERREURS, JSON.stringify(L.slice(-300))); } catch (e) { /* stockage indisponible */ } }
export function erreurs24h(st = (typeof localStorage !== 'undefined' ? localStorage : null), maintenant = Date.now()) { try { const m = {}; for (const e of JSON.parse(st.getItem(CLE_ERREURS) || '[]')) if (maintenant - e.t < J) m[e.s] = (m[e.s] || 0) + 1; return m; } catch (e) { return {}; } }
/* lecture des index (en parallèle, chacun avec un délai maximum) ; ce qui échoue est noté mais ne bloque pas les autres */
export async function lireEtat({ fetchFn = (...a) => fetch(...a), base = BASE, maintenant = Date.now(), delai = 10000 } = {}) {
  const lire = async chemin => { try { const r = await fetchFn(base + chemin + '?v=' + Math.floor(maintenant / 60000), { signal: AbortSignal.timeout ? AbortSignal.timeout(delai) : undefined }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); } catch (e) { noterErreur(chemin); return null; } };
  const [donnees, footprint, historique, controle] = await Promise.all([lire('donnees/index.json'), lire('footprint/index.json'), lire('historique/index.json'), lire('controle/controle-nuit.json')]);
  const L = construireEtat({ donnees, footprint, historique, controle }, maintenant); return { liste: L, voyant: voyant(L), controle, maintenant };
}
