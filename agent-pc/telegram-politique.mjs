/* Politique Telegram de Kepler : SEULS deux messages partent, rien d'autre.
   (a) EXECUTION : quand l'agent prend ou propose une nouvelle position (action, entrée, taille, TP, SL, levier) ;
   (b) BILAN_JOUR : un résumé de fin de journée (positions du jour, performance en R et en $).
   Les rapports hebdomadaire / quotidien, listes de critères manquants, échecs de stratégies, promotions de niveau… ne sont plus envoyés
   (ils restent dans le journal et dans les écrans). Test : galaxie/tests/telegram-politique-test.mjs */
export const TYPES_TELEGRAM = ['EXECUTION', 'BILAN_JOUR', 'TEST'];
export const autorise = type => TYPES_TELEGRAM.includes(type);
export const HEURE_BILAN_UTC = 21;   // 22 h / 23 h à Paris : après la fin de la séance américaine

const JOUR = 86400e3, fin = x => typeof x === 'number' && Number.isFinite(x);
const nombre = (x, d = 2) => (fin(x) ? x.toFixed(d).replace('.', ',') : 'n.c.');
const prix = x => (!fin(x) ? 'n.c.' : Math.abs(x) >= 1000 ? x.toFixed(1).replace('.', ',') : Math.abs(x) >= 1 ? x.toFixed(2).replace('.', ',') : x.toFixed(5).replace('.', ','));
const signe = (x, d = 2) => (x >= 0 ? '+' : '−') + nombre(Math.abs(x), d);
export const dateFr = t => new Date(t).toISOString().slice(0, 10).split('-').reverse().join('/');

/* Taille et levier d'une position SIMULÉE : risque fixe en % du capital, taille = risque / distance au stop, levier = valeur de la position / capital. */
export function dimension(p, { capital = 10000, risquePct = 1 } = {}) {
  const dist = Math.abs(p.entree - p.stop); if (!fin(p.entree) || !fin(p.stop) || !(dist > 0) || !(capital > 0)) return { taille: null, risqueUsd: null, levier: null, valeur: null };
  const risqueUsd = capital * risquePct / 100, taille = risqueUsd / dist, valeur = taille * p.entree;
  return { taille, risqueUsd, valeur, levier: valeur / capital };
}

/* Message d'exécution : action, entrée, taille, TP, SL, levier. Jamais un ordre : l'agent ne passe aucun ordre. */
export function texteExecution(p, { capital = 10000, risquePct = 1, mode = 'SIMULATION' } = {}) {
  const d = dimension(p, { capital, risquePct }), tp1 = fin(p.cible1) ? p.cible1 : p.cible, tp2 = fin(p.cible2) ? p.cible2 : null;
  const l = ['Kepler — nouvelle position · ' + p.actif + (p.tf ? ' ' + p.tf : '') + ' (' + mode + ')',
    'Action : ' + (p.sens > 0 ? 'ACHAT' : 'VENTE') + (p.nom ? ' — ' + p.nom : ''),
    'Entrée : ' + prix(p.entree),
    'Taille : ' + (d.taille == null ? 'n.c.' : nombre(d.taille, d.taille >= 10 ? 1 : 4) + ' ' + p.actif + ' (≈ ' + nombre(d.valeur, 0) + ' $, risque ' + nombre(d.risqueUsd, 0) + ' $)'),
    'TP : ' + prix(tp1) + (tp2 != null ? ' · TP2 ' + prix(tp2) : ''),
    'SL : ' + prix(p.stop),
    'Levier : ' + (d.levier == null ? 'n.c.' : 'x' + nombre(d.levier, 1))];
  l.push('Simulation : aucun ordre n’est passé.'); return l.join('\n');
}

/* Bilan de fin de journée à partir des lignes du tableau d'historique (R et $ composés dans l'ordre des sorties, mêmes chiffres que les écrans). */
export function bilanJour(lignes, t, { capital = null } = {}) {
  const j0 = Math.floor(t / JOUR) * JOUR, j1 = j0 + JOUR, dans = x => fin(x) && x >= j0 && x < j1;
  const prises = lignes.filter(l => dans(l.tEntree)), finies = lignes.filter(l => l.statut === 'terminee' && dans(l.tSortie)), ouvertes = lignes.filter(l => l.statut === 'ouverte');
  const vus = new Map(); for (const l of prises.concat(finies)) vus.set(l.id, l);
  const R = finies.reduce((s, l) => s + (fin(l.R) ? l.R : 0), 0), usd = finies.reduce((s, l) => s + (fin(l.usd) ? l.usd : 0), 0), gagnes = finies.filter(l => l.R > 0).length;
  const out = ['Kepler — bilan du ' + dateFr(t)];
  if (!vus.size && !ouvertes.length) { out.push('Aucune position aujourd’hui.'); return out.join('\n'); }
  for (const l of vus.values()) out.push('• ' + l.actif + ' ' + (l.sens > 0 ? 'ACHAT' : 'VENTE') + ' @ ' + prix(l.entree) + ' → ' + (l.statut === 'terminee' ? (l.type === 'TP' ? 'TP' : l.type === 'SL' ? 'SL' : 'clôturée') + ' ' + signe(l.R) + ' R (' + signe(l.usd || 0) + ' $)' : l.statut === 'ouverte' ? 'encore ouverte' : 'en attente'));
  out.push('Terminées : ' + finies.length + (finies.length ? ' (' + gagnes + ' gagnante' + (gagnes > 1 ? 's' : '') + ')' : '') + ' · Encore ouvertes : ' + ouvertes.length);
  out.push('Performance du jour : ' + signe(R) + ' R · ' + signe(usd) + ' $' + (capital != null ? ' · capital ' + nombre(capital, 0) + ' $' : ''));
  return out.join('\n');
}
